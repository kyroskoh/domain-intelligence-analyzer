import { logger } from '@/utils/logger';
import { connectRedis, getRedisClient } from './redisClient';
import { DomainAnalysisResponse } from '@/types/domain';
import { runCypher, isGraphEnabled } from '@/services/graph/GraphClient';
import { capRelatedDomains } from '@/utils/privacy';

const MAX_SET = parseInt(process.env.RELATION_SET_MAX || '500', 10);
const TTL = () => parseInt(process.env.SNAPSHOT_TTL_SECONDS || String(30 * 24 * 3600), 10);

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function relKey(kind: string, id: string): string {
  return `rel:${kind}:${slug(id)}`;
}

export class EntityRelationStore {
  async indexFromAnalysis(response: DomainAnalysisResponse): Promise<void> {
    const domain = response.domain.toLowerCase();
    const now = Date.now();

    const ns =
      response.whois?.nameservers ||
      response.rdap?.nameservers?.map((n) => (typeof n === 'string' ? n : n.ldhName)) ||
      [];
    const registrarName = response.whois?.registrar?.name || response.rdap?.registrar?.name;
    const registrarId =
      response.whois?.registrar?.ianaId ||
      response.rdap?.registrar?.ianaId ||
      (registrarName ? slug(registrarName) : undefined);
    const entities = response.rdap?.entities || [];
    const ssl = response.ssl;
    const intel = response.dns?.ipIntelligence || [];

    // Redis hot index
    for (const host of ns.filter(Boolean)) {
      await this.addMember('ns', host, domain, now);
    }
    if (registrarId) {
      await this.addMember('registrar', registrarId, domain, now);
    }
    for (const ent of entities) {
      if (ent.handle) await this.addMember('entity', ent.handle, domain, now);
    }
    if (ssl?.fingerprintSha256) {
      await this.addMember('cert', ssl.fingerprintSha256, domain, now);
      for (const san of (ssl.sans || []).slice(0, 40)) {
        await this.addMember('san', san, domain, now);
      }
    }
    for (const ip of intel) {
      if (ip.asn != null) await this.addMember('asn', String(ip.asn), domain, now);
      if (ip.coveringPrefix) await this.addMember('prefix', ip.coveringPrefix, domain, now);
    }

    // Memgraph upsert (soft-fail)
    if (isGraphEnabled()) {
      try {
        await this.upsertGraph(response);
      } catch (error) {
        logger.warn(`Graph upsert failed for ${domain}:`, error);
      }
    }
  }

  private async addMember(
    kind: string,
    id: string,
    domain: string,
    score: number
  ): Promise<void> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) return;
    const key = relKey(kind, id);
    try {
      await client.zAdd(key, { score, value: domain });
      await client.expire(key, TTL());
      const count = await client.zCard(key);
      if (count > MAX_SET) {
        await client.zRemRangeByRank(key, 0, count - MAX_SET - 1);
      }
    } catch (error) {
      logger.debug(`Relation add failed ${key}:`, error);
    }
  }

  async list(
    kind: string,
    id: string,
    limit = 50
  ): Promise<{ domains: string[]; source: 'graph' | 'redis' }> {
    if (isGraphEnabled()) {
      const graphDomains = await this.listFromGraph(kind, id, limit);
      if (graphDomains.length) {
        return { domains: capRelatedDomains(graphDomains, limit), source: 'graph' };
      }
    }
    const domains = await this.listFromRedis(kind, id, limit);
    return { domains: capRelatedDomains(domains, limit), source: 'redis' };
  }

  private async listFromRedis(kind: string, id: string, limit: number): Promise<string[]> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) return [];
    try {
      const key = relKey(kind, id);
      const values = await client.zRange(key, -limit, -1);
      return values.reverse();
    } catch {
      return [];
    }
  }

  private async listFromGraph(
    kind: string,
    id: string,
    limit: number
  ): Promise<string[]> {
    const normalized = slug(id);
    const map: Record<string, string> = {
      ns: 'Nameserver',
      registrar: 'Registrar',
      cert: 'Certificate',
      san: 'San',
      asn: 'Asn',
      prefix: 'Prefix',
      entity: 'Entity',
    };
    const label = map[kind];
    if (!label) return [];

    const relMap: Record<string, string> = {
      ns: 'USES_NS',
      registrar: 'REGISTERED_BY',
      cert: 'HAS_CERT',
      san: 'CERT_SAN',
      asn: 'HOSTED_IN_ASN',
      prefix: 'IN_PREFIX',
      entity: 'HAS_ENTITY',
    };
    const rel = relMap[kind];

    const rows = await runCypher<{ domain: string }>(
      `
      MATCH (d:Domain)-[:${rel}]->(n:${label} {id: $id})
      RETURN d.id AS domain
      ORDER BY d.lastSeen DESC
      LIMIT $limit
      `,
      { id: kind === 'prefix' ? id.toLowerCase() : normalized === slug(id) ? (kind === 'asn' ? id : normalized) : id, limit }
    );

    // Fix id param for asn/cert which shouldn't be over-slugified
    if (!rows.length) {
      const rows2 = await runCypher<{ domain: string }>(
        `
        MATCH (d:Domain)-[r]->(n {id: $id})
        WHERE type(r) = $rel
        RETURN d.id AS domain
        ORDER BY d.lastSeen DESC
        LIMIT $limit
        `,
        { id: id.toLowerCase(), rel, limit }
      );
      return rows2.map((r) => r.domain).filter(Boolean);
    }
    return rows.map((r) => r.domain).filter(Boolean);
  }

  private async upsertGraph(response: DomainAnalysisResponse): Promise<void> {
    const domain = response.domain.toLowerCase();
    const lastSeen = Date.now();

    await runCypher(
      `
      MERGE (d:Domain {id: $domain})
      SET d.lastSeen = $lastSeen
      `,
      { domain, lastSeen }
    );

    const ns =
      response.whois?.nameservers ||
      response.rdap?.nameservers?.map((n) => (typeof n === 'string' ? n : n.ldhName)) ||
      [];
    for (const host of ns.filter(Boolean).slice(0, 20)) {
      const id = host.toLowerCase().replace(/\.$/, '');
      await runCypher(
        `
        MERGE (n:Nameserver {id: $id})
        SET n.lastSeen = $lastSeen
        WITH n
        MATCH (d:Domain {id: $domain})
        MERGE (d)-[:USES_NS]->(n)
        `,
        { id, domain, lastSeen }
      );
    }

    const registrarName = response.whois?.registrar?.name || response.rdap?.registrar?.name;
    const registrarId =
      response.whois?.registrar?.ianaId ||
      response.rdap?.registrar?.ianaId ||
      (registrarName ? slug(registrarName) : undefined);
    if (registrarId) {
      await runCypher(
        `
        MERGE (r:Registrar {id: $id})
        SET r.name = $name, r.lastSeen = $lastSeen
        WITH r
        MATCH (d:Domain {id: $domain})
        MERGE (d)-[:REGISTERED_BY]->(r)
        `,
        { id: registrarId, name: registrarName || registrarId, domain, lastSeen }
      );
    }

    for (const ent of (response.rdap?.entities || []).slice(0, 20)) {
      if (!ent.handle) continue;
      await runCypher(
        `
        MERGE (e:Entity {id: $id})
        SET e.org = $org, e.lastSeen = $lastSeen
        WITH e
        MATCH (d:Domain {id: $domain})
        MERGE (d)-[:HAS_ENTITY]->(e)
        `,
        { id: ent.handle, org: ent.org || ent.fn || '', domain, lastSeen }
      );
    }

    if (response.ssl?.fingerprintSha256) {
      const fp = response.ssl.fingerprintSha256;
      await runCypher(
        `
        MERGE (c:Certificate {id: $fp})
        SET c.issuer = $issuer, c.isCloudflareOriginCa = $origin, c.lastSeen = $lastSeen, c.sanCount = $sanCount
        WITH c
        MATCH (d:Domain {id: $domain})
        MERGE (d)-[:HAS_CERT]->(c)
        `,
        {
          fp,
          issuer: response.ssl.issuer,
          origin: Boolean(response.ssl.isCloudflareOriginCa),
          sanCount: response.ssl.sanCount,
          domain,
          lastSeen,
        }
      );
      for (const san of response.ssl.sans.slice(0, 40)) {
        await runCypher(
          `
          MERGE (s:San {id: $san})
          SET s.lastSeen = $lastSeen
          WITH s
          MATCH (c:Certificate {id: $fp})
          MERGE (c)-[:CERT_SAN]->(s)
          WITH s
          MATCH (d:Domain {id: $domain})
          MERGE (d)-[:CERT_SAN]->(s)
          `,
          { san: san.toLowerCase(), fp, domain, lastSeen }
        );
      }
    }

    for (const ip of (response.dns?.ipIntelligence || []).slice(0, 15)) {
      if (ip.asn != null) {
        await runCypher(
          `
          MERGE (a:Asn {id: $asn})
          SET a.asOrg = $asOrg, a.lastSeen = $lastSeen
          WITH a
          MATCH (d:Domain {id: $domain})
          MERGE (d)-[:HOSTED_IN_ASN]->(a)
          `,
          { asn: String(ip.asn), asOrg: ip.asOrg || '', domain, lastSeen }
        );
      }
      if (ip.coveringPrefix) {
        await runCypher(
          `
          MERGE (p:Prefix {id: $cidr})
          SET p.lastSeen = $lastSeen
          WITH p
          MATCH (d:Domain {id: $domain})
          MERGE (d)-[:IN_PREFIX]->(p)
          `,
          { cidr: ip.coveringPrefix.toLowerCase(), domain, lastSeen }
        );
      }
    }
  }
}

export const entityRelationStore = new EntityRelationStore();
