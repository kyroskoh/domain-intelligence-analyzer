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
   * Lookup common SRV service records for the domain
   */
  private async lookupSRV(domain: string): Promise<SRVRecord[]> {
    const services = [
      `_sip._tcp.${domain}`,
      `_sip._udp.${domain}`,
      `_xmpp-server._tcp.${domain}`,
      `_xmpp-client._tcp.${domain}`,
      `_caldav._tcp.${domain}`,
      `_carddav._tcp.${domain}`,
      `_autodiscover._tcp.${domain}`,
      `_submission._tcp.${domain}`,
      `_imaps._tcp.${domain}`,
      `_pop3s._tcp.${domain}`,
    ];

    const results: SRVRecord[] = [];
    await Promise.all(
      services.map(async (name) => {
        try {
          const records = await dns.resolveSrv(name);
          for (const record of records) {
            results.push({
              name,
              type: 'SRV' as const,
              ttl: 0,
              class: 'IN',
              priority: record.priority,
              weight: record.weight,
              port: record.port,
              target: record.name,
            });
          }
        } catch {
          /* no SRV for this service */
        }
      })
    );
    return results;
  }

  /**
   * Probe common DKIM selectors (bounded).
   */
  async discoverDkim(domain: string): Promise<
    Array<{ selector: string; record?: string; valid: boolean; keyType?: string }>
  > {
    const selectors = [
      'default',
      'google',
      'selector1',
      'selector2',
      'k1',
      'k2',
      's1',
      's2',
      'dkim',
      'mail',
      'email',
      'mx',
      'smtp',
    ];
    const found: Array<{
      selector: string;
      record?: string;
      valid: boolean;
      keyType?: string;
    }> = [];

    for (const selector of selectors) {
      const name = `${selector}._domainkey.${domain}`;
      try {
        const txts = await dns.resolveTxt(name);
        const flat = txts.map((p) => p.join('')).join('');
        if (/v=DKIM1/i.test(flat) || /p=/i.test(flat)) {
          const keyType = flat.match(/k=([a-z0-9]+)/i)?.[1];
          found.push({
            selector,
            record: flat.slice(0, 500),
            valid: /p=[A-Za-z0-9+/=]+/.test(flat),
            keyType,
          });
        }
      } catch {
        /* selector absent */
      }
    }
    return found;
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
   * Check DNSSEC via DS / DNSKEY lookups (presence-based; not a full chain validator).
   */
  private async checkDnssec(domain: string): Promise<DnssecInfo> {
    const algorithms: number[] = [];
    const dsRecords: DnssecInfo['dsRecords'] = [];

    try {
      const ds = (await dns.resolve(domain, 'DS')) as Array<{
        keyTag?: number;
        algorithm?: number;
        digestType?: number;
        digest?: string;
      }>;
      for (const r of ds || []) {
        if (r.algorithm != null) algorithms.push(r.algorithm);
        if (r.keyTag != null && r.digest) {
          dsRecords!.push({
            keyTag: r.keyTag,
            algorithm: r.algorithm || 0,
            digestType: r.digestType || 0,
            digest: r.digest,
          });
        }
      }
    } catch {
      /* no DS */
    }

    let hasDnskey = false;
    try {
      const keys = (await dns.resolve(domain, 'DNSKEY')) as Array<{ algorithm?: number }>;
      hasDnskey = Array.isArray(keys) && keys.length > 0;
      for (const k of keys || []) {
        if (k.algorithm != null) algorithms.push(k.algorithm);
      }
    } catch {
      /* no DNSKEY */
    }

    const enabled = (dsRecords?.length || 0) > 0 || hasDnskey;
    return {
      enabled,
      valid: enabled ? true : undefined,
      algorithms: Array.from(new Set(algorithms)),
      dsRecords,
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