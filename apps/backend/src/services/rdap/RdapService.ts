import axios from 'axios';
import { logger } from '@/utils/logger';
import { TimeoutError } from '@/middleware/errorHandler';
import { RdapData, RdapEvent, RdapEntity, RdapNameserver, DsRecord } from '@/types/domain';

export class RdapService {
  private readonly timeout: number;
  private readonly rdapBootstrap: Map<string, string[]>;

  constructor() {
    this.timeout = parseInt(process.env.RDAP_TIMEOUT_MS || '5000');
    this.rdapBootstrap = new Map();
    this.initializeBootstrap();
  }

  /**
   * Initialize RDAP bootstrap registry
   */
  private initializeBootstrap(): void {
    // IANA RDAP Bootstrap Registry for gTLDs
    // This is a simplified version - in production, this should be fetched from IANA
    this.rdapBootstrap.set('com', ['https://rdap.verisign.com/com/v1/']);
    this.rdapBootstrap.set('net', ['https://rdap.verisign.com/net/v1/']);
    this.rdapBootstrap.set('org', ['https://rdap.pir.org/']);
    this.rdapBootstrap.set('info', ['https://rdap.afilias.net/rdap/afilias/']);
    this.rdapBootstrap.set('biz', ['https://rdap.afilias.net/rdap/afilias/']);
    this.rdapBootstrap.set('name', ['https://rdap.verisign.com/com/v1/']);
    this.rdapBootstrap.set('mobi', ['https://rdap.afilias.net/rdap/afilias/']);
    this.rdapBootstrap.set('pro', ['https://rdap.afilias.net/rdap/afilias/']);
    this.rdapBootstrap.set('travel', ['https://rdap.nic.travel/']);
    this.rdapBootstrap.set('museum', ['https://rdap.museum/']);
    this.rdapBootstrap.set('coop', ['https://rdap.nic.coop/']);
    this.rdapBootstrap.set('aero', ['https://rdap.afilias.net/rdap/afilias/']);
    this.rdapBootstrap.set('asia', ['https://rdap.afilias.net/rdap/afilias/']);
    this.rdapBootstrap.set('cat', ['https://rdap.cat/']);
    this.rdapBootstrap.set('jobs', ['https://rdap.afilias.net/rdap/afilias/']);
    this.rdapBootstrap.set('tel', ['https://rdap.afilias.net/rdap/afilias/']);
    this.rdapBootstrap.set('int', ['https://rdap.iana.org/']);
    
    // Add some popular ccTLDs
    this.rdapBootstrap.set('uk', ['https://rdap.nominet.uk/uk/']);
    this.rdapBootstrap.set('de', ['https://rdap.denic.de/']);
    this.rdapBootstrap.set('fr', ['https://rdap.nic.fr/']);
    this.rdapBootstrap.set('nl', ['https://rdap.sidn.nl/']);
    this.rdapBootstrap.set('au', ['https://rdap.auda.org.au/']);
    this.rdapBootstrap.set('ca', ['https://rdap.ca/']);
    this.rdapBootstrap.set('jp', ['https://rdap.nic.ad.jp/']);
    this.rdapBootstrap.set('br', ['https://rdap.nic.br/']);
    this.rdapBootstrap.set('mx', ['https://rdap.mx/']);
    this.rdapBootstrap.set('ru', ['https://rdap.tcinet.ru/']);
    this.rdapBootstrap.set('cn', ['https://rdap.cnnic.cn/']);
    this.rdapBootstrap.set('in', ['https://rdap.registry.in/']);
  }

  /**
   * Performs RDAP lookup for a domain
   */
  async lookup(domain: string): Promise<RdapData> {
    const startTime = Date.now();
    
    try {
      logger.info(`Starting RDAP lookup for domain: ${domain}`);
      
      // Extract TLD
      const tld = this.extractTld(domain);
      const rdapServers = this.rdapBootstrap.get(tld.toLowerCase());
      
      if (!rdapServers || rdapServers.length === 0) {
        throw new Error(`No RDAP server found for TLD: ${tld}`);
      }

      // Try each RDAP server until one succeeds
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
          continue;
        }
      }
      
      throw lastError || new Error('All RDAP servers failed');
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`RDAP lookup failed for ${domain} after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Query a specific RDAP server
   */
  private async queryRdapServer(serverUrl: string, domain: string): Promise<RdapData> {
    const url = `${serverUrl.replace(/\/$/, '')}/domain/${domain}`;
    
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'Accept': 'application/rdap+json',
          'User-Agent': 'DomainPeek/1.0.0',
        },
      });

      return this.parseRdapResponse(response.data, domain);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new TimeoutError('RDAP lookup');
        }
        throw new Error(`RDAP HTTP error: ${error.response?.status} ${error.response?.statusText}`);
      }
      throw error;
    }
  }

  /**
   * Parse RDAP response into structured format
   */
  private parseRdapResponse(data: any, domain: string): RdapData {
    const rdapData: RdapData = {
      domain,
      status: [],
      events: [],
      entities: [],
      nameservers: [],
      raw: data,
    };

    // Parse basic information
    if (data.handle) {
      rdapData.handle = data.handle;
    }

    // Parse status
    if (Array.isArray(data.status)) {
      rdapData.status = data.status;
    }

    // Parse events
    if (Array.isArray(data.events)) {
      rdapData.events = data.events.map((event: any): RdapEvent => ({
        eventAction: event.eventAction,
        eventDate: new Date(event.eventDate),
      }));
    }

    // Parse entities
    if (Array.isArray(data.entities)) {
      rdapData.entities = data.entities.map((entity: any): RdapEntity => ({
        handle: entity.handle,
        roles: entity.roles || [],
        vcardArray: entity.vcardArray,
      }));
    }

    // Parse nameservers
    if (Array.isArray(data.nameservers)) {
      rdapData.nameservers = data.nameservers.map((ns: any): RdapNameserver => ({
        ldhName: ns.ldhName,
        unicodeName: ns.unicodeName,
        ipAddresses: {
          v4: ns.ipAddresses?.v4 || [],
          v6: ns.ipAddresses?.v6 || [],
        },
      }));
    }

    // Parse DNSSEC information
    if (data.secureDNS) {
      rdapData.secureDNS = {
        delegationSigned: data.secureDNS.delegationSigned || false,
        dsRecords: data.secureDNS.dsData?.map((ds: any): DsRecord => ({
          keyTag: ds.keyTag,
          algorithm: ds.algorithm,
          digest: ds.digest,
          digestType: ds.digestType,
        })) || [],
      };
    }

    // Extract registrar information from entities
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

  /**
   * Extract entity name from vCard data
   */
  private extractEntityName(entity: any): string {
    if (entity.vcardArray && Array.isArray(entity.vcardArray)) {
      // vCard format: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Name"]]]
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

  /**
   * Extract entity URL from vCard data
   */
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
    
    // Look for links in the entity
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
   * Extract TLD from domain name
   */
  private extractTld(domain: string): string {
    const parts = domain.split('.');
    return parts[parts.length - 1];
  }

  /**
   * Validate if RDAP is available for a domain
   */
  isRdapAvailable(domain: string): boolean {
    const tld = this.extractTld(domain);
    return this.rdapBootstrap.has(tld.toLowerCase());
  }

  /**
   * Get available RDAP servers for a TLD
   */
  getRdapServers(tld: string): string[] {
    return this.rdapBootstrap.get(tld.toLowerCase()) || [];
  }

  /**
   * Update RDAP bootstrap registry (for dynamic updates)
   */
  async updateBootstrapRegistry(): Promise<void> {
    try {
      // TODO: Implement dynamic fetching of IANA RDAP Bootstrap Registry
      // This would fetch the latest registry from:
      // https://data.iana.org/rdap/dns.json
      logger.info('Bootstrap registry update not implemented yet');
    } catch (error) {
      logger.error('Failed to update RDAP bootstrap registry:', error);
    }
  }
}