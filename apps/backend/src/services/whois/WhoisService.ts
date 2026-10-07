import { domain as whoisDomain, allTlds as fetchAllTlds, WhoisSearchResult } from 'whoiser';
import { parse as parseDomain } from 'tldts';
import { logger } from '@/utils/logger';
import { TimeoutError } from '@/middleware/errorHandler';
import { WhoisData, ContactInfo } from '@/types/domain';

/**
 * Fast-path WHOIS host overrides for common/new gTLDs.
 * whoiser discovers servers via IANA for all other delegated TLDs.
 */
const WHOIS_SERVER_MAP: Record<string, string> = {
  xyz: 'whois.nic.xyz',
  fans: 'whois.nic.fans',
  app: 'whois.nic.google',
  dev: 'whois.nic.google',
  page: 'whois.nic.google',
  io: 'whois.nic.io',
  ai: 'whois.nic.ai',
  online: 'whois.nic.online',
  site: 'whois.nic.site',
  tech: 'whois.nic.tech',
  store: 'whois.nic.store',
  blog: 'whois.nic.blog',
  cloud: 'whois.nic.cloud',
  shop: 'whois.nic.shop',
  club: 'whois.nic.club',
  live: 'whois.nic.live',
  world: 'whois.nic.world',
  space: 'whois.nic.space',
  website: 'whois.nic.website',
  me: 'whois.nic.me',
  co: 'whois.nic.co',
  tv: 'whois.nic.tv',
  cc: 'ccwhois.verisign-grs.com',
};

const REDACTED_MARKERS = [
  'redacted for privacy',
  'data protected',
  'privacy protected',
  'not disclosed',
  'gdpr masked',
  'withheld for privacy',
  'redacted',
];

export class WhoisService {
  private readonly timeout: number;
  private readonly follow: number;
  private allTldsCache: string[] | null = null;
  private allTldsPromise: Promise<string[]> | null = null;

  constructor() {
    this.timeout = parseInt(process.env.WHOIS_TIMEOUT_MS || '10000', 10);
    this.follow = parseInt(process.env.WHOIS_FOLLOW || '2', 10);
  }

  /**
   * Load every TLD published by IANA (via whoiser). Cached in-memory.
   */
  async getAllTlds(): Promise<string[]> {
    if (this.allTldsCache) {
      return this.allTldsCache;
    }
    if (!this.allTldsPromise) {
      this.allTldsPromise = fetchAllTlds()
        .then((tlds: string[]) => {
          const normalized = (tlds || []).map((t: string) => t.toLowerCase());
          this.allTldsCache = normalized;
          logger.info(`Loaded ${normalized.length} TLDs from IANA via whoiser`);
          return normalized;
        })
        .catch((error: unknown) => {
          this.allTldsPromise = null;
          logger.warn('Failed to load IANA TLD list via whoiser:', error);
          return Object.keys(WHOIS_SERVER_MAP);
        });
    }
    return this.allTldsPromise;
  }

  async isTldSupported(domain: string): Promise<boolean> {
    const tld = this.extractRegistryTld(domain);
    const all = await this.getAllTlds();
    if (all.includes(tld)) return true;
    // Multi-label public suffix: check final label (e.g. uk for co.uk)
    const last = tld.split('.').pop();
    return Boolean(last && all.includes(last));
  }

  /**
   * Performs WHOIS lookup for a domain against any IANA-delegated TLD.
   */
  async lookup(domain: string): Promise<WhoisData> {
    const startTime = Date.now();
    const normalized = domain.toLowerCase().replace(/\.$/, '');

    try {
      logger.info(`Starting WHOIS lookup for domain: ${normalized}`);

      const host = this.resolveWhoisServer(normalized);
      const result = (await Promise.race([
        whoisDomain(normalized, {
          host,
          timeout: this.timeout,
          follow: this.follow,
          raw: true,
          ignorePrivacy: false,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new TimeoutError('WHOIS lookup')), this.timeout + 1500);
        }),
      ])) as WhoisSearchResult;

      const rawWhois = this.extractRawText(result);
      const parsedData = this.parseWhoisData(rawWhois, normalized);
      this.applyWhoiserFields(parsedData, result);

      const duration = Date.now() - startTime;
      logger.info(`WHOIS lookup completed for ${normalized} in ${duration}ms`);

      return parsedData;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`WHOIS lookup failed for ${normalized} after ${duration}ms:`, error);
      throw error;
    }
  }

  resolveWhoisServer(domain: string): string | undefined {
    const labels = domain.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);

    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join('.');
      if (WHOIS_SERVER_MAP[candidate]) {
        return WHOIS_SERVER_MAP[candidate];
      }
    }

    const parsed = parseDomain(domain);
    const publicSuffix = parsed.publicSuffix?.toLowerCase();
    if (publicSuffix && WHOIS_SERVER_MAP[publicSuffix]) {
      return WHOIS_SERVER_MAP[publicSuffix];
    }

    const tld = publicSuffix?.split('.').pop() || labels[labels.length - 1];
    return tld ? WHOIS_SERVER_MAP[tld] : undefined;
  }

  extractRegistryTld(domain: string): string {
    const parsed = parseDomain(domain);
    if (parsed.publicSuffix) {
      return parsed.publicSuffix.toLowerCase();
    }
    const labels = domain.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
    return labels[labels.length - 1] || domain;
  }

  private extractRawText(result: WhoisSearchResult): string {
    const chunks: string[] = [];
    for (const [server, data] of Object.entries(result || {})) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      const raw = (data as WhoisSearchResult).__raw;
      if (typeof raw === 'string' && raw.trim()) {
        chunks.push(`% Server: ${server}\n${raw}`);
      } else {
        chunks.push(`% Server: ${server}\n${JSON.stringify(data, null, 2)}`);
      }
    }
    return chunks.join('\n\n');
  }

  /**
   * Prefer whoiser's already-normalized fields when present.
   */
  private applyWhoiserFields(whoisData: WhoisData, result: WhoisSearchResult): void {
    const layers = Object.values(result || {}).filter(
      (v): v is WhoisSearchResult => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
    );
    // Registrar layer is usually last when follow >= 2
    const preferred = [...layers].reverse();

    for (const layer of preferred) {
      const registrar = layer['Registrar'] || layer['registrar'];
      if (!whoisData.registrar?.name && typeof registrar === 'string' && !this.isRedacted(registrar)) {
        whoisData.registrar = { name: registrar };
      }

      const registrarUrl = layer['Registrar URL'] || layer['Registrar URL'];
      if (whoisData.registrar && typeof registrarUrl === 'string') {
        whoisData.registrar.url = whoisData.registrar.url || registrarUrl;
      }

      const ianaId = layer['Registrar IANA ID'];
      if (whoisData.registrar && (typeof ianaId === 'string' || typeof ianaId === 'number')) {
        whoisData.registrar.ianaId = whoisData.registrar.ianaId || String(ianaId);
      }

      const ns = layer['Name Server'] || layer['nserver'];
      if ((!whoisData.nameservers || whoisData.nameservers.length === 0) && ns) {
        const list = Array.isArray(ns) ? ns : [ns];
        whoisData.nameservers = list
          .map((n) => String(n).toLowerCase().replace(/\.$/, ''))
          .filter(Boolean);
      }

      const status = layer['Domain Status'] || layer['Status'];
      if ((!whoisData.status || whoisData.status.length === 0) && status) {
        const list = Array.isArray(status) ? status : [status];
        whoisData.status = list.map((s) => String(s).split(/\s+/)[0]).filter(Boolean);
      }

      const created = layer['Creation Date'] || layer['Created Date'] || layer['Created'];
      if (!whoisData.createdDate && typeof created === 'string') {
        whoisData.createdDate = this.parseDate(created);
      }

      const updated = layer['Updated Date'] || layer['Last Updated'];
      if (!whoisData.updatedDate && typeof updated === 'string') {
        whoisData.updatedDate = this.parseDate(updated);
      }

      const expiry =
        layer['Expiry Date'] ||
        layer['Registry Expiry Date'] ||
        layer['Registrar Registration Expiration Date'];
      if (!whoisData.expirationDate && typeof expiry === 'string') {
        whoisData.expirationDate = this.parseDate(expiry);
      }
    }
  }

  /**
   * Parses raw WHOIS data into structured format
   */
  parseWhoisData(rawData: string, domain: string): WhoisData {
    const lines = rawData.split(/\r?\n/).map((line) => line.trim());

    const whoisData: WhoisData = {
      domain,
      nameservers: [],
      status: [],
      raw: rawData,
    };

    for (const line of lines) {
      if (!line || line.startsWith('%') || line.startsWith('#') || line.startsWith('>>>')) {
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex <= 0) continue;

      const key = line.slice(0, colonIndex);
      const value = line.slice(colonIndex + 1).trim();
      if (!key || !value || this.isRedacted(value)) continue;

      const normalizedKey = key.toLowerCase().trim();

      if (
        (normalizedKey === 'registrar' || normalizedKey === 'registrar name') &&
        !whoisData.registrar
      ) {
        whoisData.registrar = { name: value };
      } else if (
        (normalizedKey.includes('registrar url') || normalizedKey === 'registrar website') &&
        whoisData.registrar
      ) {
        whoisData.registrar.url = value;
      } else if (normalizedKey.includes('registrar iana id') && whoisData.registrar) {
        whoisData.registrar.ianaId = value;
      } else if (
        normalizedKey.includes('abuse') &&
        normalizedKey.includes('email') &&
        whoisData.registrar
      ) {
        whoisData.registrar.abuseContactEmail = value;
      } else if (
        normalizedKey.includes('abuse') &&
        normalizedKey.includes('phone') &&
        whoisData.registrar
      ) {
        whoisData.registrar.abuseContactPhone = value;
      } else if (
        normalizedKey.includes('name server') ||
        normalizedKey === 'nserver' ||
        normalizedKey === 'nameserver'
      ) {
        const ns = value.split(/\s+/)[0].toLowerCase().replace(/\.$/, '');
        if (ns && !whoisData.nameservers.includes(ns)) {
          whoisData.nameservers.push(ns);
        }
      } else if (normalizedKey.includes('status') || normalizedKey === 'domain status') {
        const statusValue = value.split(/\s+/)[0];
        if (statusValue && !whoisData.status.includes(statusValue)) {
          whoisData.status.push(statusValue);
        }
      } else if (
        normalizedKey.includes('creation') ||
        normalizedKey.includes('created') ||
        normalizedKey === 'registered' ||
        normalizedKey === 'registration time'
      ) {
        whoisData.createdDate = this.parseDate(value) ?? whoisData.createdDate;
      } else if (
        normalizedKey.includes('updated') ||
        normalizedKey.includes('modified') ||
        normalizedKey === 'last updated'
      ) {
        whoisData.updatedDate = this.parseDate(value) ?? whoisData.updatedDate;
      } else if (
        normalizedKey.includes('expir') ||
        normalizedKey.includes('registry expiry') ||
        normalizedKey === 'paid-till'
      ) {
        whoisData.expirationDate = this.parseDate(value) ?? whoisData.expirationDate;
      } else if (normalizedKey.includes('lock')) {
        whoisData.registrarLockStatus = value.toLowerCase().includes('lock');
      }
    }

    whoisData.registrant = this.parseContactInfo(rawData, 'registrant');
    whoisData.administrative = this.parseContactInfo(rawData, 'admin');
    whoisData.technical = this.parseContactInfo(rawData, 'tech');
    whoisData.billing = this.parseContactInfo(rawData, 'billing');

    return whoisData;
  }

  private isRedacted(value: string): boolean {
    const lower = value.toLowerCase();
    return REDACTED_MARKERS.some((marker) => lower.includes(marker));
  }

  private parseContactInfo(rawData: string, contactType: string): ContactInfo | undefined {
    const lines = rawData.split(/\r?\n/);
    const contact: ContactInfo = {};
    let foundContact = false;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      if (trimmed.includes(contactType)) {
        foundContact = true;
      }

      if (!foundContact) continue;

      if (
        (trimmed.includes('registrant') ||
          trimmed.includes('admin') ||
          trimmed.includes('tech') ||
          trimmed.includes('billing')) &&
        !trimmed.includes(contactType)
      ) {
        if (!trimmed.startsWith(contactType)) {
          break;
        }
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex <= 0) continue;

      const key = line.slice(0, colonIndex);
      const value = line.slice(colonIndex + 1).trim();
      if (!key || !value || this.isRedacted(value)) continue;

      const normalizedKey = key.toLowerCase().trim();

      if (
        normalizedKey.includes('name') &&
        !normalizedKey.includes('org') &&
        !normalizedKey.includes('server')
      ) {
        contact.name = value;
      } else if (normalizedKey.includes('org')) {
        contact.organization = value;
      } else if (normalizedKey.includes('email')) {
        contact.email = value;
      } else if (normalizedKey.includes('phone')) {
        contact.phone = value;
      } else if (normalizedKey.includes('fax')) {
        contact.fax = value;
      } else if (normalizedKey.includes('address') || normalizedKey.includes('street')) {
        contact.address = contact.address ? `${contact.address}, ${value}` : value;
      } else if (normalizedKey.includes('city')) {
        contact.city = value;
      } else if (normalizedKey.includes('state') || normalizedKey.includes('province')) {
        contact.state = value;
      } else if (normalizedKey.includes('postal') || normalizedKey.includes('zip')) {
        contact.postalCode = value;
      } else if (normalizedKey.includes('country')) {
        contact.country = value;
      }
    }

    return Object.keys(contact).length > 0 ? contact : undefined;
  }

  private parseDate(dateString: string): Date | undefined {
    if (!dateString) return undefined;

    const dateFormats = [
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/,
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{2}-\d{2}-\d{4})/,
      /(\d{2}\/\d{2}\/\d{4})/,
      /(\d{4}\.\d{2}\.\d{2})/,
      /(\d{2}\.\d{2}\.\d{4})/,
    ];

    for (const format of dateFormats) {
      const match = dateString.match(format);
      if (match) {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    const parsed = new Date(dateString);
    return !isNaN(parsed.getTime()) ? parsed : undefined;
  }

  isDomainValid(domain: string): boolean {
    const parsed = parseDomain(domain);
    return Boolean(parsed.domain && parsed.isIcann);
  }
}
