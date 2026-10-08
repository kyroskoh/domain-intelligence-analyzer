import axios from 'axios';
import { logger } from '@/utils/logger';
import { RdapData, RdapEntity, RdapLink } from '@/types/domain';
import { withOutboundThrottle } from '@/utils/outboundThrottle';
import { connectRedis, getRedisClient } from '@/services/cache/redisClient';

const MAX_FOLLOWS = parseInt(process.env.RDAP_FOLLOW_MAX || '3', 10);
const TTL = parseInt(process.env.RDAP_FOLLOW_CACHE_TTL || '86400', 10);
const FOLLOW_TIMEOUT_MS = parseInt(process.env.RDAP_TIMEOUT_MS || '25000', 10);

type VCardFields = {
  fn?: string;
  org?: string;
  email?: string;
  tel?: string;
  addr?: string | string[];
  url?: string;
};

/**
 * Cap-follow RDAP related / entity links (backend only, cached + throttled).
 * Used for thin→thick registrar RDAP (e.g. CentralNic → namerdap.systems).
 */
export class RdapFollowService {
  async enrich(rdap: RdapData): Promise<{ entities: RdapEntity[]; warnings: string[] }> {
    const warnings: string[] = [];
    const entities = [...(rdap.entities || [])];
    const links: RdapLink[] = [...(rdap.links || [])];

    for (const ent of rdap.entities || []) {
      const rawLinks = (ent as { links?: RdapLink[] }).links;
      if (Array.isArray(rawLinks)) links.push(...rawLinks);
    }

    const seen = new Set<string>();
    const candidates = links
      .filter((l) => l.href && /^https?:\/\//i.test(l.href))
      .filter((l) => {
        const rel = (l.rel || '').toLowerCase();
        const title = (l.title || '').toLowerCase();
        const type = (l.type || '').toLowerCase();
        // Prefer RDAP JSON targets; skip HTML help/about pages
        if (type.includes('html') || type.includes('text/plain')) return false;
        if (rel === 'help' || rel === 'copyright' || rel === 'about') return false;
        // Match rel/title first (related registrar records, entity refs)
        if (/related|entity|registrar|alternate/i.test(rel) || /related|entity|registrar|alternate/i.test(title)) {
          return true;
        }
        // Fallback: RDAP entity path in href
        return /\/entity\//i.test(l.href);
      })
      .filter((l) => {
        const key = l.href.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_FOLLOWS);

    for (const link of candidates) {
      try {
        const data = await this.fetchJson(link.href);
        if (!data) continue;

        this.mergeFollowedPayload(rdap, entities, data, link.href);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        warnings.push(`RDAP follow failed for ${link.href}`);
        logger.warn(`RDAP follow error for ${link.href}: ${reason}`);
      }
    }

    return { entities, warnings };
  }

  private mergeFollowedPayload(
    rdap: RdapData,
    entities: RdapEntity[],
    data: any,
    sourceHref: string
  ): void {
    const incoming: any[] = [];
    if (Array.isArray(data.entities)) {
      incoming.push(...data.entities);
      for (const parent of data.entities) {
        if (Array.isArray(parent?.entities)) incoming.push(...parent.entities);
      }
    }
    if (data.objectClassName === 'entity' || (data.handle && !data.ldhName)) {
      incoming.push(data);
    }

    for (const e of incoming) {
      if (!e?.handle) continue;
      const mapped = this.mapEntity(e);
      const idx = entities.findIndex((x) => x.handle === mapped.handle);
      if (idx === -1) {
        entities.push(mapped);
      } else {
        entities[idx] = { ...entities[idx], ...mapped, roles: mapped.roles?.length ? mapped.roles : entities[idx].roles };
      }
    }

    // Thick domain objects often carry IANA registrar id + richer registrar entity
    const publicIds = Array.isArray(data.publicIds) ? data.publicIds : [];
    const iana = publicIds.find(
      (p: { type?: string; identifier?: string }) => /iana/i.test(p.type || '')
    );
    if (iana?.identifier) {
      if (!rdap.registrar) {
        rdap.registrar = { name: 'Unknown' };
      }
      rdap.registrar.ianaId = String(iana.identifier);
    }

    const registrarEntity =
      incoming.find((e) => Array.isArray(e.roles) && e.roles.includes('registrar')) ||
      (Array.isArray(data.entities)
        ? data.entities.find((e: any) => e.roles?.includes('registrar'))
        : undefined);
    if (registrarEntity) {
      const mapped = this.mapEntity(registrarEntity);
      if (!rdap.registrar) {
        rdap.registrar = { name: mapped.fn || mapped.org || mapped.handle || 'Unknown' };
      } else {
        if (mapped.fn || mapped.org) {
          rdap.registrar.name = mapped.fn || mapped.org || rdap.registrar.name;
        }
        if (mapped.url) {
          rdap.registrar.url = mapped.url;
        }
      }
      const entityIana = Array.isArray(registrarEntity.publicIds)
        ? registrarEntity.publicIds.find(
            (p: { type?: string; identifier?: string }) => /iana/i.test(p.type || '')
          )
        : undefined;
      if (entityIana?.identifier) {
        rdap.registrar.ianaId = String(entityIana.identifier);
      }
    }

    // Prefer thick nameservers when the thin registry response omitted them
    if (
      (!rdap.nameservers || rdap.nameservers.length === 0) &&
      Array.isArray(data.nameservers) &&
      data.nameservers.length > 0
    ) {
      rdap.nameservers = data.nameservers.map((ns: any) => ({
        ldhName: ns.ldhName,
        unicodeName: ns.unicodeName,
        ipAddresses: {
          v4: ns.ipAddresses?.v4 || [],
          v6: ns.ipAddresses?.v6 || [],
        },
      }));
    }

    logger.debug(`RDAP follow merged payload from ${sourceHref}`);
  }

  private mapEntity(e: any): RdapEntity {
    const vcard = parseVCard(e);
    return {
      handle: e.handle,
      roles: Array.isArray(e.roles) ? e.roles : [],
      vcardArray: e.vcardArray,
      fn: e.fn || vcard.fn,
      org: e.org || vcard.org,
      email: e.email || vcard.email,
      tel: e.tel || vcard.tel,
      addr: e.addr || vcard.addr,
      url: e.url || vcard.url,
    };
  }

  private async fetchJson(url: string): Promise<any | null> {
    const cacheKey = `rdap:follow:${url}`;
    try {
      const client = getRedisClient() ?? (await connectRedis());
      if (client?.isOpen) {
        const hit = await client.get(cacheKey);
        if (hit) {
          try {
            return JSON.parse(hit);
          } catch {
            // corrupt cache entry — fall through to network
          }
        }
      }
    } catch (error) {
      logger.debug(`RDAP follow cache read skipped for ${url}:`, error);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await withOutboundThrottle(
          'rdap-follow',
          async () => {
            const res = await axios.get(url, {
              timeout: FOLLOW_TIMEOUT_MS,
              maxRedirects: 5,
              headers: {
                Accept: 'application/rdap+json, application/json',
                'User-Agent': 'DomainPeek/1.3.0 (+https://domainpeek.xyz)',
              },
              validateStatus: (status) => status >= 200 && status < 300,
            });
            return res.data;
          },
          { minIntervalMs: 400, maxConcurrency: 2 }
        );

        try {
          const client = getRedisClient();
          if (client?.isOpen && data) {
            await client.setEx(cacheKey, TTL, JSON.stringify(data));
          }
        } catch (error) {
          logger.debug(`RDAP follow cache write skipped for ${url}:`, error);
        }

        return data;
      } catch (error) {
        lastError = error;
        const retryable =
          axios.isAxiosError(error) &&
          (!error.response ||
            error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNRESET' ||
            (error.response.status >= 500 && error.response.status < 600) ||
            error.response.status === 429);
        if (!retryable || attempt === 1) break;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

function parseVCard(entity: any): VCardFields {
  const result: VCardFields = {};
  if (!entity?.vcardArray || !Array.isArray(entity.vcardArray)) {
    return result;
  }
  const vcardProperties = entity.vcardArray[1];
  if (!Array.isArray(vcardProperties)) {
    return result;
  }

  for (const property of vcardProperties) {
    if (!Array.isArray(property) || property.length < 4) continue;
    const [name, , , value] = property;
    if (value === undefined || value === null || value === '') continue;

    switch (name) {
      case 'fn':
        result.fn = String(value);
        break;
      case 'org':
        result.org = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value);
        break;
      case 'email':
        result.email = String(value);
        break;
      case 'tel':
        result.tel = String(value);
        break;
      case 'adr':
        if (Array.isArray(value)) {
          const parts = value.map((p) => (p == null ? '' : String(p).trim())).filter(Boolean);
          if (parts.length) result.addr = parts;
        } else {
          result.addr = String(value);
        }
        break;
      case 'url':
      case 'contact-uri':
        result.url = String(value);
        break;
      default:
        break;
    }
  }

  return result;
}

export const rdapFollowService = new RdapFollowService();
