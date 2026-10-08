import axios from 'axios';
import { logger } from '@/utils/logger';
import { connectRedis, getRedisClient } from '@/services/cache/redisClient';
import { withOutboundThrottle } from '@/utils/outboundThrottle';
import { CtLookupResult } from '@/types/domain';

export class CtLookupService {
  private readonly enabledDefault: boolean;
  private readonly ttl: number;
  private readonly cooldownSeconds: number;

  constructor() {
    this.enabledDefault = (process.env.CT_LOOKUP_ENABLED || 'false').toLowerCase() === 'true';
    this.ttl = parseInt(process.env.CT_CACHE_TTL_SECONDS || '86400', 10);
    this.cooldownSeconds = parseInt(process.env.CT_COOLDOWN_SECONDS || '300', 10);
  }

  async lookup(domain: string, force = false): Promise<CtLookupResult | null> {
    if (!this.enabledDefault && !force) {
      return null;
    }

    const normalized = domain.toLowerCase().replace(/\.$/, '');
    const cacheKey = `ct:domain:${normalized}`;
    const cooldownKey = `ct:cooldown:${normalized}`;

    const client = getRedisClient() ?? (await connectRedis());
    if (client?.isOpen) {
      const cached = await client.get(cacheKey);
      if (cached) return JSON.parse(cached) as CtLookupResult;

      if (!force) {
        const cool = await client.get(cooldownKey);
        if (cool) {
          logger.debug(`CT cooldown active for ${normalized}`);
          return null;
        }
      }
    }

    try {
      const result = await withOutboundThrottle(
        'crt-sh',
        async () => {
          const url = `https://crt.sh/?q=${encodeURIComponent(normalized)}&output=json`;
          const { data } = await axios.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'DomainPeek/1.1.0 (+https://domainpeek.xyz)' },
          });
          const rows = Array.isArray(data) ? data : [];
          const names = new Set<string>();
          for (const row of rows.slice(0, 200)) {
            const nv = String(row.name_value || '');
            for (const line of nv.split('\n')) {
              const n = line.trim().toLowerCase().replace(/^\*\./, '');
              if (n && n.includes('.')) names.add(n);
            }
          }
          return {
            domain: normalized,
            ctSans: Array.from(names).slice(0, 100),
            source: 'crt.sh' as const,
            fetchedAt: new Date().toISOString(),
            historical: true,
          };
        },
        {
          minIntervalMs: parseInt(process.env.CT_MIN_INTERVAL_MS || '3000', 10),
          maxConcurrency: 1,
        }
      );

      if (client?.isOpen) {
        await client.setEx(cacheKey, this.ttl, JSON.stringify(result));
        await client.setEx(cooldownKey, this.cooldownSeconds, '1');
      }
      return result;
    } catch (error) {
      logger.warn(`CT lookup failed for ${normalized}:`, error);
      return null;
    }
  }
}

export const ctLookupService = new CtLookupService();
