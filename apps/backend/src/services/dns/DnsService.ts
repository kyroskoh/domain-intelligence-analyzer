import { promises as dns, RecordWithTtl } from 'dns';
import { logger } from '@/utils/logger';
import { TimeoutError } from '@/middleware/errorHandler';
import { 
  DnsData, 
  ARecord, 
  AAAARecord, 
  MXRecord, 
  TXTRecord, 
  NSRecord, 
  SOARecord, 
  CNameRecord,
  CAARecord,
  SRVRecord,
  PTRRecord,
  NameserverInfo,
  DnssecInfo,
} from '@/types/domain';

export class DnsService {
  private readonly timeout: number;

  constructor() {
    this.timeout = parseInt(process.env.DNS_TIMEOUT_MS || '5000');
  }

  /**
   * Performs comprehensive DNS lookup for a domain
   */
  async lookup(domain: string): Promise<DnsData> {
    const startTime = Date.now();
    
    try {
      logger.info(`Starting DNS lookup for domain: ${domain}`);
      
      const [
        aRecords,
        aaaaRecords,
        mxRecords,
        txtRecords,
        nsRecords,
        soaRecords,
        cnameRecords,
        caaRecords,
        srvRecords,
        ptrRecords,
      ] = await Promise.allSettled([
        this.lookupA(domain),
        this.lookupAAAA(domain),
        this.lookupMX(domain),
        this.lookupTXT(domain),
        this.lookupNS(domain),
        this.lookupSOA(domain),
        this.lookupCNAME(domain),
        this.lookupCAA(domain),
        this.lookupSRV(domain),
        this.lookupPTR(domain),
      ]);

      // Get nameserver information
      const nameservers = await this.getNameserverInfo(domain);
      
      // Check DNSSEC
      const dnssec = await this.checkDnssec(domain);

      const dnsData: DnsData = {
        domain,
        records: {
          A: this.getSettledValue(aRecords) || [],
          AAAA: this.getSettledValue(aaaaRecords) || [],
          MX: this.getSettledValue(mxRecords) || [],
          TXT: this.getSettledValue(txtRecords) || [],
          NS: this.getSettledValue(nsRecords) || [],
          SOA: this.getSettledValue(soaRecords) || [],
          CNAME: this.getSettledValue(cnameRecords) || [],
          CAA: this.getSettledValue(caaRecords) || [],
          SRV: this.getSettledValue(srvRecords) || [],
          PTR: this.getSettledValue(ptrRecords) || [],
        },
        nameservers,
        dnssec,
      };

      const duration = Date.now() - startTime;
      logger.info(`DNS lookup completed for ${domain} in ${duration}ms`);
      
      return dnsData;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`DNS lookup failed for ${domain} after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Lookup A records
   */
  private async lookupA(domain: string): Promise<ARecord[]> {
    try {
      const records = await dns.resolve4(domain, { ttl: true });
      return records.map((record: RecordWithTtl) => ({
        name: domain,
        type: 'A' as const,
        ttl: record.ttl,
        class: 'IN',
        address: record.address,
      }));
    } catch (error) {
      logger.debug(`A record lookup failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Lookup AAAA records
   */
  private async lookupAAAA(domain: string): Promise<AAAARecord[]> {
    try {
      const records = await dns.resolve6(domain, { ttl: true });
      return records.map((record: RecordWithTtl) => ({
        name: domain,
        type: 'AAAA' as const,
        ttl: record.ttl,
        class: 'IN',
        address: record.address,
      }));
    } catch (error) {
      logger.debug(`AAAA record lookup failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Lookup MX records
   */
  private async lookupMX(domain: string): Promise<MXRecord[]> {
    try {
      const records = await dns.resolveMx(domain);
      return records.map(record => ({
        name: domain,
        type: 'MX' as const,
        ttl: 0, // MX records from Node.js don't include TTL
        class: 'IN',
        priority: record.priority,
        exchange: record.exchange,
      }));
    } catch (error) {
      logger.debug(`MX record lookup failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Lookup TXT records
   */
  private async lookupTXT(domain: string): Promise<TXTRecord[]> {
    try {
      const records = await dns.resolveTxt(domain);
      return records.map(record => ({
        name: domain,
        type: 'TXT' as const,
        ttl: 0, // TXT records from Node.js don't include TTL
        class: 'IN',
        data: Array.isArray(record) ? record : [record],
      }));
    } catch (error) {
      logger.debug(`TXT record lookup failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Lookup NS records
   */
  private async lookupNS(domain: string): Promise<NSRecord[]> {
    try {
      const records = await dns.resolveNs(domain);
      return records.map(record => ({
        name: domain,
        type: 'NS' as const,
        ttl: 0, // NS records from Node.js don't include TTL
        class: 'IN',
        nsdname: record,
      }));
    } catch (error) {
      logger.debug(`NS record lookup failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Lookup SOA records
   */
  private async lookupSOA(domain: string): Promise<SOARecord[]> {
    try {
      const record = await dns.resolveSoa(domain);
      return [{
        name: domain,
        type: 'SOA' as const,
        ttl: 0, // SOA records from Node.js don't include TTL
        class: 'IN',
        mname: record.nsname,
        rname: record.hostmaster,
        serial: record.serial,
        refresh: record.refresh,
        retry: record.retry,
        expire: record.expire,
        minimum: record.minttl,
      }];
    } catch (error) {
      logger.debug(`SOA record lookup failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Lookup CNAME records
   */
  private async lookupCNAME(domain: string): Promise<CNameRecord[]> {
    try {
      const records = await dns.resolveCname(domain);
      return records.map(record => ({
        name: domain,
        type: 'CNAME' as const,
        ttl: 0, // CNAME records from Node.js don't include TTL
        class: 'IN',
        cname: record,
      }));
    } catch (error) {
      logger.debug(`CNAME record lookup failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Lookup CAA records
   */
  private async lookupCAA(domain: string): Promise<CAARecord[]> {
    try {
      const records = await dns.resolveCaa(domain);
      return records.map(record => ({
        name: domain,
        type: 'CAA' as const,
        ttl: 0, // CAA records from Node.js don't include TTL
        class: 'IN',
        flag: record.critical ? 128 : 0,
        tag: record.issue || record.issuewild || 'unknown',
        value: (record as any).value || '',
      }));
    } catch (error) {
      logger.debug(`CAA record lookup failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Lookup SRV records (placeholder - Node.js doesn't have built-in SRV support)
   */
  private async lookupSRV(domain: string): Promise<SRVRecord[]> {
    // TODO: Implement SRV lookup using dns-socket or similar library
    logger.debug(`SRV record lookup not implemented for ${domain}`);
    return [];
  }

  /**
   * Lookup PTR records (reverse DNS)
   */
  private async lookupPTR(domain: string): Promise<PTRRecord[]> {
    try {
      // Only attempt PTR lookup if domain looks like an IP address
      if (!this.isIPAddress(domain)) {
        return [];
      }
      
      const records = await dns.reverse(domain);
      return records.map(record => ({
        name: domain,
        type: 'PTR' as const,
        ttl: 0,
        class: 'IN',
        ptrdname: record,
      }));
    } catch (error) {
      logger.debug(`PTR record lookup failed for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Get nameserver information with health checks
   */
  private async getNameserverInfo(domain: string): Promise<NameserverInfo[]> {
    try {
      const nsRecords = await dns.resolveNs(domain);
      const nameservers: NameserverInfo[] = [];

      for (const ns of nsRecords) {
        const info: NameserverInfo = {
          name: ns,
          reachable: false,
        };

        try {
          // Try to resolve the nameserver's IP
          const startTime = Date.now();
          const addresses = await dns.resolve4(ns);
          const responseTime = Date.now() - startTime;
          
          info.ip = addresses[0];
          info.responseTime = responseTime;
          info.reachable = true;
        } catch (error) {
          logger.debug(`Failed to resolve nameserver ${ns}:`, error);
        }

        nameservers.push(info);
      }

      return nameservers;
    } catch (error) {
      logger.debug(`Failed to get nameserver info for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Check DNSSEC status
   */
  private async checkDnssec(domain: string): Promise<DnssecInfo> {
    // TODO: Implement proper DNSSEC checking using dns-socket or dig
    // For now, return basic structure
    return {
      enabled: false,
      valid: undefined,
      algorithms: [],
      dsRecords: [],
    };
  }

  /**
   * Helper method to extract values from Promise.allSettled results
   */
  private getSettledValue<T>(result: PromiseSettledResult<T>): T | undefined {
    return result.status === 'fulfilled' ? result.value : undefined;
  }

  /**
   * Check if a string is an IP address
   */
  private isIPAddress(str: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(str) || ipv6Regex.test(str);
  }

  /**
   * Performs DNS lookup with timeout
   */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError('DNS lookup'));
      }, this.timeout);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}