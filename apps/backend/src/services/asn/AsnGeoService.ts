import axios from 'axios';
import { logger } from '@/utils/logger';
import { connectRedis, getRedisClient } from '@/services/cache/redisClient';
import { withOutboundThrottle } from '@/utils/outboundThrottle';
import { longestMatchingPrefix } from './prefixMatch';
import { IpIntelligence } from '@/types/domain';

async function redisGet(key: string): Promise<string | null> {
  const client = getRedisClient() ?? (await connectRedis());
  if (!client?.isOpen) return null;
  return client.get(key);
}

async function redisSet(key: string, ttl: number, value: string): Promise<void> {
  const client = getRedisClient() ?? (await connectRedis());
  if (!client?.isOpen) return;
  await client.setEx(key, ttl, value);
}

export class AsnGeoService {
  private readonly enabled: boolean;
  private readonly provider: string;
  private readonly heEnabled: boolean;
  private readonly geoTtl: number;
  private readonly bgpTtl: number;

  constructor() {
    this.enabled = (process.env.IP_GEO_ENABLED || 'true').toLowerCase() !== 'false';
    this.provider = (process.env.IP_GEO_PROVIDER || 'both').toLowerCase();
    this.heEnabled =
      this.provider === 'he' ||
      this.provider === 'both' ||
      (process.env.HE_BGP_ENABLED || 'true').toLowerCase() === 'true';
    this.geoTtl = parseInt(process.env.IP_GEO_CACHE_TTL_SECONDS || '86400', 10);
    this.bgpTtl = parseInt(process.env.HE_BGP_CACHE_TTL_SECONDS || '604800', 10);
  }

  async lookupIps(ips: string[]): Promise<IpIntelligence[]> {
    if (!this.enabled) return [];
    const unique = Array.from(new Set(ips.filter(Boolean)));
    const results: IpIntelligence[] = [];
    for (const ip of unique.slice(0, 15)) {
      try {
        results.push(await this.lookupIp(ip));
      } catch (error) {
        logger.debug(`IP intel failed for ${ip}:`, error);
      }
    }
    return results;
  }

  async lookupIp(ip: string): Promise<IpIntelligence> {
    const cacheKey = `geoip:${ip}`;
    const cached = await redisGet(cacheKey);
    if (cached) {
      return JSON.parse(cached) as IpIntelligence;
    }

    let base: IpIntelligence = { ip, sources: [] };

    if (this.provider === 'ip-api' || this.provider === 'both') {
      try {
        const geo = await this.fetchIpApi(ip);
        base = { ...base, ...geo, sources: [...(base.sources || []), 'ip-api'] };
      } catch (error) {
        logger.debug(`ip-api failed for ${ip}:`, error);
      }
    }

    if (this.heEnabled && (this.provider === 'he' || this.provider === 'both')) {
      try {
        const he = await this.fetchHeBgp(ip);
        const asnMismatch =
          base.asn != null && he.asn != null && Number(base.asn) !== Number(he.asn);
        base = {
          ...base,
          asn: he.asn ?? base.asn,
          asOrg: he.asOrg || base.asOrg,
          prefixes: he.prefixes,
          coveringPrefix: he.coveringPrefix,
          prefixMatch: he.prefixMatch,
          asnMismatch: asnMismatch || undefined,
          heUrl: he.heUrl,
          sources: [...(base.sources || []), 'bgp.he.net'],
        };
      } catch (error) {
        logger.debug(`bgp.he.net failed for ${ip}:`, error);
      }
    }

    await redisSet(cacheKey, this.geoTtl, JSON.stringify(base));
    return base;
  }

  private async fetchIpApi(ip: string): Promise<Partial<IpIntelligence>> {
    return withOutboundThrottle(
      'ip-api',
      async () => {
        const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,city,isp,as,asname,query`;
        const { data } = await axios.get(url, { timeout: 5000 });
        if (data.status !== 'success') {
          throw new Error(data.message || 'ip-api failed');
        }
        const asnMatch = String(data.as || '').match(/AS(\d+)/i);
        return {
          ip: data.query || ip,
          country: data.country,
          city: data.city,
          isp: data.isp,
          asn: asnMatch ? parseInt(asnMatch[1], 10) : undefined,
          asOrg: data.asname || data.as,
        };
      },
      {
        minIntervalMs: parseInt(process.env.IP_GEO_MIN_INTERVAL_MS || '500', 10),
        maxConcurrency: parseInt(process.env.IP_GEO_MAX_CONCURRENCY || '1', 10),
      }
    );
  }

  /**
   * HE BGP toolkit HTML — parse cautiously; heavily throttled + cached.
   */
  private async fetchHeBgp(ip: string): Promise<{
    asn?: number;
    asOrg?: string;
    prefixes: string[];
    coveringPrefix?: string;
    prefixMatch?: boolean;
    heUrl: string;
  }> {
    const cacheKey = `bgp:ip:${ip}`;
    const hit = await redisGet(cacheKey);
    if (hit) return JSON.parse(hit);

    const heUrl = `https://bgp.he.net/ip/${encodeURIComponent(ip)}`;
    const parsed = await withOutboundThrottle(
      'he-bgp',
      async () => {
        const { data: html } = await axios.get<string>(heUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'DomainPeek/1.1.0 (+https://domainpeek.xyz; research)',
            Accept: 'text/html',
          },
          responseType: 'text',
        });

        const asnMatch = html.match(/AS(\d{1,10})/i);
        const asn = asnMatch ? parseInt(asnMatch[1], 10) : undefined;
        const orgMatch = html.match(/<title>[^<]*AS\d+\s+([^|<]+)/i);
        const asOrg = orgMatch?.[1]?.trim();

        const prefixes = Array.from(
          new Set(
            (html.match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b|\b[0-9a-f:]+\/\d{1,3}\b/gi) || [])
              .map((p) => p.toLowerCase())
              .slice(0, 80)
          )
        );

        const coveringPrefix = longestMatchingPrefix(ip, prefixes);
        return {
          asn,
          asOrg,
          prefixes,
          coveringPrefix,
          prefixMatch: Boolean(coveringPrefix),
          heUrl,
        };
      },
      {
        minIntervalMs: parseInt(process.env.HE_BGP_MIN_INTERVAL_MS || '2000', 10),
        maxConcurrency: parseInt(process.env.HE_BGP_MAX_CONCURRENCY || '1', 10),
      }
    );

    await redisSet(cacheKey, this.bgpTtl, JSON.stringify(parsed));

    if (parsed.asn != null && parsed.prefixes.length) {
      await redisSet(
        `bgp:asn:${parsed.asn}:prefixes`,
        this.bgpTtl,
        JSON.stringify(parsed.prefixes)
      );
    }

    return parsed;
  }
}

export const asnGeoService = new AsnGeoService();
