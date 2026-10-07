import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { parse as parseDomain } from 'tldts';
import { logger } from '@/utils/logger';
import { TimeoutError } from '@/middleware/errorHandler';
import { RdapData, RdapEvent, RdapEntity, RdapNameserver, DsRecord } from '@/types/domain';

const IANA_RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const BOOTSTRAP_REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours
const BOOTSTRAP_CACHE_FILE = path.join(process.cwd(), 'data', 'rdap-bootstrap.json');

interface IanaBootstrapFile {
  description?: string;
  publication?: string;
  services: Array<[string[], string[]]>;
}

export class RdapService {
  private readonly timeout: number;
  private readonly rdapBootstrap: Map<string, string[]>;
  private bootstrapReady: Promise<void>;
  private lastBootstrapUpdate = 0;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.timeout = parseInt(process.env.RDAP_TIMEOUT_MS || '5000', 10);
    this.rdapBootstrap = new Map();
    this.seedFallbackBootstrap();
    this.bootstrapReady = this.initializeBootstrap();
    this.scheduleBootstrapRefresh();
  }

  /**
   * Seed a minimal fallback map used only if IANA fetch and cache both fail.
   */
  private seedFallbackBootstrap(): void {
    const seed: Record<string, string[]> = {
      com: ['https://rdap.verisign.com/com/v1/'],
      net: ['https://rdap.verisign.com/net/v1/'],
      org: ['https://rdap.pir.org/'],
      info: ['https://rdap.identitydigital.services/rdap/'],
      biz: ['https://rdap.identitydigital.services/rdap/'],
      xyz: ['https://rdap.centralnic.com/xyz/'],
      app: ['https://rdap.nic.google/'],
      dev: ['https://rdap.nic.google/'],
      fans: ['https://rdap.centralnic.com/fans/'],
      io: ['https://rdap.nic.io/'],
      ai: ['https://rdap.nic.ai/'],
      online: ['https://rdap.centralnic.com/online/'],
      site: ['https://rdap.centralnic.com/site/'],
      tech: ['https://rdap.centralnic.com/tech/'],
      store: ['https://rdap.centralnic.com/store/'],
      blog: ['https://rdap.blog.fury.ca/rdap/'],
      uk: ['https://rdap.nominet.uk/uk/'],
      de: ['https://rdap.denic.de/'],
      fr: ['https://rdap.nic.fr/'],
      int: ['https://rdap.iana.org/'],
    };

    for (const [tld, servers] of Object.entries(seed)) {
      this.rdapBootstrap.set(tld, servers);
    }
  }

  private async initializeBootstrap(): Promise<void> {
    try {
      const loadedFromCache = await this.loadBootstrapFromCache();
      if (loadedFromCache) {
        logger.info(`Loaded RDAP bootstrap from cache (${this.rdapBootstrap.size} TLDs)`);
      }

      const age = Date.now() - this.lastBootstrapUpdate;
      if (!loadedFromCache || age > BOOTSTRAP_REFRESH_MS) {
        await this.updateBootstrapRegistry();
      }
    } catch (error) {
      logger.warn('RDAP bootstrap initialization used fallback seed:', error);
    }
  }

  private scheduleBootstrapRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.refreshTimer = setInterval(() => {
      void this.updateBootstrapRegistry().catch((error) => {
        logger.warn('Scheduled RDAP bootstrap refresh failed:', error);
      });
    }, BOOTSTRAP_REFRESH_MS);
    // Allow process to exit without waiting on the timer
    this.refreshTimer.unref?.();
  }

  private async loadBootstrapFromCache(): Promise<boolean> {
    try {
      const raw = await fs.readFile(BOOTSTRAP_CACHE_FILE, 'utf-8');
      const data = JSON.parse(raw) as IanaBootstrapFile & { cachedAt?: string };
      if (!data.services?.length) {
        return false;
      }
      this.applyBootstrapFile(data);
      this.lastBootstrapUpdate = data.cachedAt
        ? Date.parse(data.cachedAt) || Date.now()
        : Date.now();
      return true;
    } catch {
      return false;
    }
  }

  private async saveBootstrapToCache(data: IanaBootstrapFile): Promise<void> {
    try {
      await fs.mkdir(path.dirname(BOOTSTRAP_CACHE_FILE), { recursive: true });
      const payload = {
        ...data,
        cachedAt: new Date().toISOString(),
      };
      await fs.writeFile(BOOTSTRAP_CACHE_FILE, JSON.stringify(payload), 'utf-8');
    } catch (error) {
      logger.warn('Failed to persist RDAP bootstrap cache:', error);
    }
  }

  private applyBootstrapFile(data: IanaBootstrapFile): void {
    const next = new Map<string, string[]>();
    for (const [tlds, urls] of data.services) {
      if (!Array.isArray(tlds) || !Array.isArray(urls) || urls.length === 0) {
        continue;
      }
      for (const tld of tlds) {
        next.set(String(tld).toLowerCase(), urls);
      }
    }
    if (next.size === 0) {
      return;
    }
    this.rdapBootstrap.clear();
    for (const [tld, urls] of next) {
      this.rdapBootstrap.set(tld, urls);
    }
  }

  /**
   * Fetch and apply the IANA RDAP DNS bootstrap registry.
   */
  async updateBootstrapRegistry(): Promise<void> {
    try {
      logger.info('Fetching IANA RDAP bootstrap registry...');
      const response = await axios.get<IanaBootstrapFile>(IANA_RDAP_BOOTSTRAP_URL, {
        timeout: Math.max(this.timeout, 15000),
        headers: {
          Accept: 'application/json',
          'User-Agent': 'DomainPeek/1.0.0',
        },
      });

      if (!response.data?.services?.length) {
        throw new Error('IANA RDAP bootstrap response missing services');
      }

      this.applyBootstrapFile(response.data);
      this.lastBootstrapUpdate = Date.now();
      await this.saveBootstrapToCache(response.data);

      logger.info(
        `RDAP bootstrap updated from IANA (${this.rdapBootstrap.size} TLDs, published ${response.data.publication || 'unknown'})`
      );
    } catch (error) {
      logger.error('Failed to update RDAP bootstrap registry:', error);
      throw error;
    }
  }

  async ensureReady(): Promise<void> {
    await this.bootstrapReady;
  }

  /**
   * Performs RDAP lookup for a domain
   */
  async lookup(domain: string): Promise<RdapData> {
    const startTime = Date.now();
    await this.ensureReady();

    try {
      logger.info(`Starting RDAP lookup for domain: ${domain}`);

      const rdapServers = this.findRdapServers(domain);
      if (!rdapServers || rdapServers.length === 0) {
        const tld = this.extractTld(domain);
        throw new Error(`No RDAP server found for TLD: ${tld}`);
      }

      let lastError: Error | null = null;
      for (const server of rdapServers) {
        try {
          const rdapData = await this.queryRdapServer(server, domain);
          const duration = Date.now() - startTime;
          logger.info(`RDAP lookup completed for ${domain} in ${duration}ms using ${server}`);
          return rdapData;
        } catch (error) {
          logger.warn(`RDAP query failed for ${server}:`, error);
          lastError = error as Error;
        }
      }

      throw lastError || new Error('All RDAP servers failed');
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`RDAP lookup failed for ${domain} after ${duration}ms:`, error);
      throw error;
    }
  }

  private async queryRdapServer(serverUrl: string, domain: string): Promise<RdapData> {
    const url = `${serverUrl.replace(/\/$/, '')}/domain/${encodeURIComponent(domain)}`;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          Accept: 'application/rdap+json, application/json',
          'User-Agent': 'DomainPeek/1.0.0',
        },
        validateStatus: (status) => status >= 200 && status < 300,
      });

      return this.parseRdapResponse(response.data, domain);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new TimeoutError('RDAP lookup');
        }
        throw new Error(
          `RDAP HTTP error: ${error.response?.status ?? 'network'} ${error.response?.statusText ?? error.message}`
        );
      }
      throw error;
    }
  }

  private parseRdapResponse(data: any, domain: string): RdapData {
    const rdapData: RdapData = {
      domain,
      status: [],
      events: [],
      entities: [],
      nameservers: [],
      raw: data,
    };

    if (data.handle) {
      rdapData.handle = data.handle;
    }

    if (Array.isArray(data.status)) {
      rdapData.status = data.status;
    }

    if (Array.isArray(data.events)) {
      rdapData.events = data.events.map(
        (event: any): RdapEvent => ({
          eventAction: event.eventAction,
          eventDate: new Date(event.eventDate),
        })
      );
    }

    if (Array.isArray(data.entities)) {
      rdapData.entities = data.entities.map(
        (entity: any): RdapEntity => ({
          handle: entity.handle,
          roles: entity.roles || [],
          vcardArray: entity.vcardArray,
        })
      );
    }

    if (Array.isArray(data.nameservers)) {
      rdapData.nameservers = data.nameservers.map(
        (ns: any): RdapNameserver => ({
          ldhName: ns.ldhName,
          unicodeName: ns.unicodeName,
          ipAddresses: {
            v4: ns.ipAddresses?.v4 || [],
            v6: ns.ipAddresses?.v6 || [],
          },
        })
      );
    }

    if (data.secureDNS) {
      rdapData.secureDNS = {
        delegationSigned: data.secureDNS.delegationSigned || false,
        dsRecords:
          data.secureDNS.dsData?.map(
            (ds: any): DsRecord => ({
              keyTag: ds.keyTag,
              algorithm: ds.algorithm,
              digest: ds.digest,
              digestType: ds.digestType,
            })
          ) || [],
      };
    }

    const registrarEntity = data.entities?.find((entity: any) =>
      entity.roles?.includes('registrar')
    );

    if (registrarEntity) {
      rdapData.registrar = {
        name: this.extractEntityName(registrarEntity),
        url: this.extractEntityUrl(registrarEntity),
      };
    }

    return rdapData;
  }

  private extractEntityName(entity: any): string {
    if (entity.vcardArray && Array.isArray(entity.vcardArray)) {
      const vcardProperties = entity.vcardArray[1];
      if (Array.isArray(vcardProperties)) {
        for (const property of vcardProperties) {
          if (Array.isArray(property) && property[0] === 'fn') {
            return property[3] || 'Unknown';
          }
          if (Array.isArray(property) && property[0] === 'org') {
            return property[3] || 'Unknown';
          }
        }
      }
    }

    return entity.handle || 'Unknown';
  }

  private extractEntityUrl(entity: any): string | undefined {
    if (entity.vcardArray && Array.isArray(entity.vcardArray)) {
      const vcardProperties = entity.vcardArray[1];
      if (Array.isArray(vcardProperties)) {
        for (const property of vcardProperties) {
          if (Array.isArray(property) && property[0] === 'url') {
            return property[3];
          }
        }
      }
    }

    if (Array.isArray(entity.links)) {
      for (const link of entity.links) {
        if (link.rel === 'self' || link.rel === 'related') {
          return link.href;
        }
      }
    }

    return undefined;
  }

  /**
   * Longest-match TLD lookup against the bootstrap map (handles co.uk etc.).
   * Falls back to tldts publicSuffix / TLD.
   */
  private findRdapServers(domain: string): string[] | undefined {
    const labels = domain.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);

    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join('.');
      const servers = this.rdapBootstrap.get(candidate);
      if (servers?.length) {
        return servers;
      }
    }

    const parsed = parseDomain(domain);
    if (parsed.publicSuffix) {
      const byPublicSuffix = this.rdapBootstrap.get(parsed.publicSuffix.toLowerCase());
      if (byPublicSuffix?.length) {
        return byPublicSuffix;
      }
    }
    if (parsed.publicSuffix) {
      const tld = parsed.publicSuffix.split('.').pop();
      if (tld) {
        const byTld = this.rdapBootstrap.get(tld.toLowerCase());
        if (byTld?.length) {
          return byTld;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract registry TLD / public suffix for messaging and capability checks.
   */
  extractTld(domain: string): string {
    const parsed = parseDomain(domain);
    if (parsed.publicSuffix) {
      return parsed.publicSuffix.toLowerCase();
    }
    const labels = domain.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
    return labels[labels.length - 1] || domain;
  }

  isRdapAvailable(domain: string): boolean {
    return Boolean(this.findRdapServers(domain)?.length);
  }

  getRdapServers(tld: string): string[] {
    return this.rdapBootstrap.get(tld.toLowerCase()) || [];
  }

  getBootstrapSize(): number {
    return this.rdapBootstrap.size;
  }

  async close(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
