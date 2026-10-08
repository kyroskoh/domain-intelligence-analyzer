import axios from 'axios';
import { logger } from '@/utils/logger';
import { RdapData, RdapEntity, RdapLink } from '@/types/domain';
import { withOutboundThrottle } from '@/utils/outboundThrottle';
import { connectRedis, getRedisClient } from '@/services/cache/redisClient';

const MAX_FOLLOWS = parseInt(process.env.RDAP_FOLLOW_MAX || '3', 10);
const TTL = parseInt(process.env.RDAP_FOLLOW_CACHE_TTL || '86400', 10);

/**
 * Cap-follow RDAP related / entity links (backend only, cached + throttled).
 */
export class RdapFollowService {
  async enrich(rdap: RdapData): Promise<{ entities: RdapEntity[]; warnings: string[] }> {
    const warnings: string[] = [];
    const entities = [...(rdap.entities || [])];
    const links: RdapLink[] = [...(rdap.links || [])];

    for (const ent of rdap.entities || []) {
      // entities may carry links in raw
      const rawLinks = (ent as { links?: RdapLink[] }).links;
      if (Array.isArray(rawLinks)) links.push(...rawLinks);
    }

    const candidates = links
      .filter((l) => l.href && /^https?:\/\//i.test(l.href))
      .filter((l) => /related|entity|registrar|alternate/i.test(l.rel || l.title || l.href))
      .slice(0, MAX_FOLLOWS);

    for (const link of candidates) {
      try {
        const data = await this.fetchJson(link.href);
        if (!data) continue;
        if (Array.isArray(data.entities)) {
          for (const e of data.entities) {
            if (e?.handle && !entities.some((x) => x.handle === e.handle)) {
              entities.push({
                handle: e.handle,
                roles: e.roles || [],
                fn: e.fn,
                org: e.org,
                email: e.email,
                tel: e.tel,
                url: e.url,
              });
            }
          }
        } else if (data.handle) {
          if (!entities.some((x) => x.handle === data.handle)) {
            entities.push({
              handle: data.handle,
              roles: data.roles || ['related'],
              fn: data.fn,
              org: data.org || data.name,
              url: link.href,
            });
          }
        }
        // IANA registrar id sometimes in publicIds
        if (data.publicIds && rdap.registrar) {
          const iana = data.publicIds.find(
            (p: { type?: string; identifier?: string }) =>
              /iana/i.test(p.type || '')
          );
          if (iana?.identifier) {
            rdap.registrar.ianaId = String(iana.identifier);
          }
        }
      } catch (error) {
        warnings.push(`RDAP follow failed for ${link.href}`);
        logger.debug('RDAP follow error:', error);
      }
    }

    return { entities, warnings };
  }

  private async fetchJson(url: string): Promise<any | null> {
    const cacheKey = `rdap:follow:${url}`;
    const client = getRedisClient() ?? (await connectRedis());
    if (client?.isOpen) {
      const hit = await client.get(cacheKey);
      if (hit) return JSON.parse(hit);
    }

    const data = await withOutboundThrottle(
      'rdap-follow',
      async () => {
        const res = await axios.get(url, {
          timeout: parseInt(process.env.RDAP_TIMEOUT_MS || '15000', 10),
          headers: {
            Accept: 'application/rdap+json, application/json',
            'User-Agent': 'DomainPeek/1.2.0 (+https://domainpeek.xyz)',
          },
        });
        return res.data;
      },
      { minIntervalMs: 400, maxConcurrency: 2 }
    );

    if (client?.isOpen && data) {
      await client.setEx(cacheKey, TTL, JSON.stringify(data));
    }
    return data;
  }
}

export const rdapFollowService = new RdapFollowService();
