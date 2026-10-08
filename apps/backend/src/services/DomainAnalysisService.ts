import { randomUUID } from 'crypto';
import { logger } from '@/utils/logger';
import { WhoisService } from './whois/WhoisService';
import { DnsService } from './dns/DnsService';
import { RdapService } from './rdap/RdapService';
import { CacheService } from './cache/CacheService';
import { SecurityAnalysisService } from './security/SecurityAnalysisService';
import { 
  DomainAnalysisRequest, 
  DomainAnalysisResponse, 
  AnalysisMeta,
  WhoisData,
  DnsData,
  RdapData,
} from '@/types/domain';

export class DomainAnalysisService {
  private whoisService: WhoisService;
  private dnsService: DnsService;
  private rdapService: RdapService;
  private cacheService: CacheService;
  private securityService: SecurityAnalysisService;

  constructor() {
    this.whoisService = new WhoisService();
    this.dnsService = new DnsService();
    this.rdapService = new RdapService();
    this.cacheService = new CacheService();
    this.securityService = new SecurityAnalysisService();
  }

  /**
   * Performs comprehensive domain analysis
   */
  async analyzeDomain(request: DomainAnalysisRequest): Promise<DomainAnalysisResponse> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const domain = request.domain.toLowerCase();
    
    logger.info(`Starting domain analysis for ${domain}`, {
      requestId,
      domain,
      request,
    });

    const meta: AnalysisMeta = {
      requestId,
      duration: 0,
      cached: false,
      errors: [],
      warnings: [],
    };

    const response: DomainAnalysisResponse = {
      domain,
      analyzedAt: new Date().toISOString(),
      meta,
    };

    try {
      // Check cache first
      const cacheKey = CacheService.generateDomainKey(domain);
      const cachedResult = await this.cacheService.get<DomainAnalysisResponse>(cacheKey);
      
      if (cachedResult) {
        logger.info(`Returning cached analysis for ${domain}`, { requestId });
        cachedResult.meta.cached = true;
        cachedResult.meta.duration = Date.now() - startTime;
        return cachedResult;
      }

      // Run RDAP, WHOIS, and DNS in parallel so a slow RDAP server does not delay the rest
      await this.rdapService.ensureReady();

      const wantRdap = request.includeRdap !== false;
      const wantWhois = request.includeWhois !== false;
      const wantDns = request.includeDns !== false;

      const [rdapSettled, whoisSettled, dnsSettled] = await Promise.allSettled([
        wantRdap ? this.performRdapLookup(domain, meta) : Promise.resolve(null),
        wantWhois ? this.performWhoisLookup(domain, meta) : Promise.resolve(null),
        wantDns ? this.performDnsLookup(domain, meta) : Promise.resolve(null),
      ]);

      let rdapData: RdapData | null = null;
      if (wantRdap) {
        if (rdapSettled.status === 'fulfilled' && rdapSettled.value) {
          rdapData = rdapSettled.value;
          response.rdap = rdapData;
        } else if (rdapSettled.status === 'rejected') {
          const err = rdapSettled.reason as Error;
          const isTimeout =
            err?.name === 'TimeoutError' || /timed out/i.test(err?.message || '');
          meta.warnings.push(
            isTimeout
              ? 'RDAP timed out; showing WHOIS/DNS where available'
              : `RDAP lookup failed: ${err.message}`
          );
        }
      }

      const rdapThin = !rdapData || this.isRdapThin(rdapData);

      if (wantWhois) {
        if (whoisSettled.status === 'fulfilled' && whoisSettled.value) {
          response.whois = whoisSettled.value as WhoisData;
        } else if (whoisSettled.status === 'rejected') {
          const err = whoisSettled.reason as Error;
          if (!rdapData) {
            meta.errors.push(`WHOIS lookup failed: ${err.message}`);
          } else {
            meta.warnings.push(`WHOIS lookup failed: ${err.message}`);
          }
        } else if (rdapData && rdapThin) {
          meta.warnings.push('WHOIS unavailable; using RDAP registration data only');
        }
      }

      if (wantDns) {
        if (dnsSettled.status === 'fulfilled' && dnsSettled.value) {
          response.dns = dnsSettled.value as DnsData;
        } else if (dnsSettled.status === 'rejected') {
          meta.errors.push(
            `DNS lookup failed: ${(dnsSettled.reason as Error).message}`
          );
        }
      }

      if (response.rdap && response.whois) {
        response.whois = this.mergeRegistrationData(response.whois, response.rdap);
      } else if (response.rdap && !response.whois) {
        response.whois = this.whoisFromRdap(response.rdap);
        meta.warnings.push('WHOIS unavailable; using RDAP registration data for WHOIS fields');
      }

      // Perform security analysis if requested
      if (request.includeSecurityAnalysis !== false && (response.dns || response.whois || response.rdap)) {
        try {
          const securityAnalysis = await this.securityService.analyzeSecurity(domain, {
            whois: response.whois,
            dns: response.dns,
            rdap: response.rdap,
          });
          response.security = securityAnalysis;
        } catch (error) {
          meta.errors.push(`Security analysis failed: ${(error as Error).message}`);
        }
      }

      // Update meta information
      meta.duration = Date.now() - startTime;

      // Cache useful results, but never pin a transient RDAP soft-fail — that
      // would keep "RDAP timed out" in Redis/memory for the full TTL.
      const rdapTransientFailure =
        wantRdap &&
        !response.rdap &&
        meta.warnings.some((w) => /RDAP timed out|RDAP lookup failed/i.test(w));

      if ((response.whois || response.rdap || response.dns) && !rdapTransientFailure) {
        await this.cacheService.set(cacheKey, response);
      }

      logger.info(`Completed domain analysis for ${domain}`, {
        requestId,
        duration: meta.duration,
        errors: meta.errors.length,
        warnings: meta.warnings.length,
      });

      return response;

    } catch (error) {
      meta.duration = Date.now() - startTime;
      meta.errors.push(`Analysis failed: ${(error as Error).message}`);
      
      logger.error(`Domain analysis failed for ${domain}`, {
        requestId,
        duration: meta.duration,
        error,
      });

      throw error;
    }
  }

  /**
   * Perform WHOIS lookup with caching
   */
  private async performWhoisLookup(domain: string, meta: AnalysisMeta): Promise<WhoisData | null> {
    const cacheKey = CacheService.generateWhoisKey(domain);
    
    try {
      // Check cache first
      const cached = await this.cacheService.get<WhoisData>(cacheKey);
      if (cached) {
        logger.debug(`Using cached WHOIS data for ${domain}`);
        return cached;
      }

      // Perform lookup
      const whoisData = await this.whoisService.lookup(domain);
      
      // Cache the result
      await this.cacheService.set(cacheKey, whoisData);
      
      return whoisData;
    } catch (error) {
      logger.warn(`WHOIS lookup failed for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Perform RDAP lookup with caching
   */
  private async performRdapLookup(domain: string, meta: AnalysisMeta): Promise<RdapData | null> {
    const cacheKey = CacheService.generateRdapKey(domain);
    
    try {
      await this.rdapService.ensureReady();

      // Check if RDAP is available for this domain
      if (!this.rdapService.isRdapAvailable(domain)) {
        const tld = this.rdapService.extractTld(domain);
        meta.warnings.push(`RDAP not available for TLD .${tld}; falling back to WHOIS`);
        return null;
      }

      // Check cache first
      const cached = await this.cacheService.get<RdapData>(cacheKey);
      if (cached) {
        logger.debug(`Using cached RDAP data for ${domain}`);
        return cached;
      }

      // Perform lookup
      const rdapData = await this.rdapService.lookup(domain);
      
      // Cache the result
      await this.cacheService.set(cacheKey, rdapData);
      
      return rdapData;
    } catch (error) {
      logger.warn(`RDAP lookup failed for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * RDAP is thin when key registration fields are missing.
   */
  private isRdapThin(rdap: RdapData): boolean {
    const hasRegistrar = Boolean(rdap.registrar?.name);
    const hasEvents = Array.isArray(rdap.events) && rdap.events.length > 0;
    const hasNameservers = Array.isArray(rdap.nameservers) && rdap.nameservers.length > 0;
    return !(hasRegistrar && (hasEvents || hasNameservers));
  }

  /**
   * Fill gaps in WHOIS structured fields from RDAP when available.
   * Also sets creationDate/expiryDate aliases used by the frontend panel.
   */
  private mergeRegistrationData(whois: WhoisData, rdap: RdapData): WhoisData {
    const merged: WhoisData = { ...whois };

    if (!merged.domain && rdap.domain) {
      merged.domain = rdap.domain;
    }

    if (!merged.registrar?.name && rdap.registrar?.name) {
      merged.registrar = {
        name: rdap.registrar.name,
        url: rdap.registrar.url,
      };
    }

    if ((!merged.nameservers || merged.nameservers.length === 0) && rdap.nameservers?.length) {
      merged.nameservers = rdap.nameservers
        .map((ns) => (ns.ldhName || ns.unicodeName || '').toLowerCase())
        .filter(Boolean);
    }

    if ((!merged.status || merged.status.length === 0) && rdap.status?.length) {
      merged.status = [...rdap.status];
    }

    let registrationDate: Date | string | undefined;
    let expirationDate: Date | string | undefined;
    let lastChangedDate: Date | string | undefined;
    let rdapDbUpdateDate: Date | string | undefined;

    for (const event of rdap.events || []) {
      const action = (event.eventAction || '').toLowerCase().trim();
      if (action === 'registration' || action === 'registered') {
        registrationDate ??= event.eventDate;
      } else if (action === 'expiration' || action === 'expired') {
        expirationDate ??= event.eventDate;
      } else if (action === 'last changed') {
        lastChangedDate ??= event.eventDate;
      } else if (action === 'last update of rdap database') {
        rdapDbUpdateDate ??= event.eventDate;
      }
    }

    if (!merged.createdDate && registrationDate) {
      merged.createdDate = registrationDate as Date;
    }
    if (!merged.expirationDate && expirationDate) {
      merged.expirationDate = expirationDate as Date;
    }
    if (!merged.updatedDate && (lastChangedDate || rdapDbUpdateDate)) {
      merged.updatedDate = (lastChangedDate || rdapDbUpdateDate) as Date;
    }

    // Frontend WhoisPanel aliases
    const anyMerged = merged as WhoisData & {
      creationDate?: Date | string;
      expiryDate?: Date | string;
      domainName?: string;
    };
    anyMerged.creationDate ??= merged.createdDate;
    anyMerged.expiryDate ??= merged.expirationDate;
    anyMerged.domainName ??= merged.domain || rdap.domain;

    return merged;
  }

  /**
   * Build a WHOIS-shaped object from RDAP when WHOIS itself is unavailable.
   */
  private whoisFromRdap(rdap: RdapData): WhoisData {
    return this.mergeRegistrationData(
      {
        domain: rdap.domain,
        raw: '',
      } as WhoisData,
      rdap
    );
  }

  /**
   * Perform DNS lookup with caching
   */
  private async performDnsLookup(domain: string, meta: AnalysisMeta): Promise<DnsData | null> {
    const cacheKey = CacheService.generateDnsKey(domain);
    
    try {
      // Check cache first
      const cached = await this.cacheService.get<DnsData>(cacheKey);
      if (cached) {
        logger.debug(`Using cached DNS data for ${domain}`);
        return cached;
      }

      // Perform lookup
      const dnsData = await this.dnsService.lookup(domain);
      
      // Cache the result
      await this.cacheService.set(cacheKey, dnsData);
      
      return dnsData;
    } catch (error) {
      logger.warn(`DNS lookup failed for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Get individual WHOIS data
   */
  async getWhoisData(domain: string): Promise<WhoisData> {
    const meta: AnalysisMeta = {
      requestId: randomUUID(),
      duration: 0,
      cached: false,
      errors: [],
      warnings: [],
    };

    const result = await this.performWhoisLookup(domain, meta);
    if (!result) {
      throw new Error('WHOIS data not available');
    }
    return result;
  }

  /**
   * Get individual RDAP data
   */
  async getRdapData(domain: string): Promise<RdapData> {
    const meta: AnalysisMeta = {
      requestId: randomUUID(),
      duration: 0,
      cached: false,
      errors: [],
      warnings: [],
    };

    const result = await this.performRdapLookup(domain, meta);
    if (!result) {
      throw new Error('RDAP data not available');
    }
    return result;
  }

  /**
   * Get individual DNS data
   */
  async getDnsData(domain: string): Promise<DnsData> {
    const meta: AnalysisMeta = {
      requestId: randomUUID(),
      duration: 0,
      cached: false,
      errors: [],
      warnings: [],
    };

    const result = await this.performDnsLookup(domain, meta);
    if (!result) {
      throw new Error('DNS data not available');
    }
    return result;
  }

  /**
   * Clear cached data for a domain
   */
  async clearDomainCache(domain: string): Promise<void> {
    const keys = [
      CacheService.generateDomainKey(domain),
      CacheService.generateWhoisKey(domain),
      CacheService.generateRdapKey(domain),
      CacheService.generateDnsKey(domain),
    ];

    await Promise.allSettled(
      keys.map(key => this.cacheService.delete(key))
    );

    logger.info(`Cleared cache for domain: ${domain}`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheService.getStats();
  }

  /**
   * Health check for the analysis service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      whois: boolean;
      dns: boolean;
      rdap: boolean;
      cache: {
        memory: boolean;
        redis: boolean;
      };
    };
  }> {
    try {
      // Test basic DNS resolution (most reliable)
      const testDomain = 'google.com';
      
      const [cacheHealth] = await Promise.allSettled([
        this.cacheService.healthCheck(),
      ]);

      const services = {
        whois: true, // WHOIS is generally available
        dns: true, // DNS is generally available
        rdap: this.rdapService.isRdapAvailable('google.com'), // Test RDAP availability
        cache: cacheHealth.status === 'fulfilled' ? cacheHealth.value : { memory: false, redis: false },
      };

      // Determine overall health
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (!services.dns || !services.cache.memory) {
        status = 'unhealthy';
      } else if (!services.whois || !services.rdap || !services.cache.redis) {
        status = 'degraded';
      }

      return {
        status,
        services,
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        services: {
          whois: false,
          dns: false,
          rdap: false,
          cache: {
            memory: false,
            redis: false,
          },
        },
      };
    }
  }

  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    await this.rdapService.close();
    await this.cacheService.close();
    logger.info('Domain analysis service closed');
  }
}