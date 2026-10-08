import { randomUUID } from 'crypto';
import { logger } from '@/utils/logger';
import { DomainAnalysisResponse, SecurityAnalysis } from '@/types/domain';
import { redactText } from '@/utils/privacy';
import { connectRedis, getRedisClient } from './redisClient';

export interface AnalysisSnapshot {
  id: string;
  domain: string;
  analyzedAt: string;
  overallScore: number;
  dnsScore: number;
  registrationScore: number;
  rdapScore?: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  events: string[];
  hasWhois: boolean;
  hasRdap: boolean;
  hasDns: boolean;
  hasSsl?: boolean;
  durationMs?: number;
  /** Compact payload for share/detail views */
  security?: Pick<SecurityAnalysis, 'overallScore' | 'breakdown' | 'risks'>;
  registrar?: { name: string; url?: string; ianaId?: string };
  nameservers?: string[];
  entities?: { handle?: string; roles?: string[]; org?: string }[];
  ssl?: {
    fingerprintSha256: string;
    issuer: string;
    sans: string[];
    isCloudflareOriginCa?: boolean;
    validTo?: string;
  };
  asnSummary?: { asn: number; asOrg?: string }[];
  privacy?: { redacted: boolean; announced: boolean };
}

const MAX_SNAPSHOTS_PER_DOMAIN = 100;

function snapshotTtlSeconds(): number {
  return parseInt(process.env.SNAPSHOT_TTL_SECONDS || String(30 * 24 * 3600), 10);
}

function riskFromScore(score: number): AnalysisSnapshot['riskLevel'] {
  if (score < 40) return 'critical';
  if (score < 60) return 'high';
  if (score < 80) return 'medium';
  return 'low';
}

function categoryScore(security: SecurityAnalysis | undefined, needle: string): number {
  const found = security?.breakdown?.find((b) =>
    b.category.toLowerCase().includes(needle.toLowerCase())
  );
  return found?.score ?? security?.overallScore ?? 0;
}

export function buildSnapshotFromAnalysis(
  response: DomainAnalysisResponse,
  options?: { announced?: boolean }
): AnalysisSnapshot {
  const security = response.security;
  const overallScore = security?.overallScore ?? 0;
  const events =
    security?.risks?.slice(0, 5).map((r) => r.title || r.description).filter(Boolean) || [];

  const registrarName =
    response.whois?.registrar?.name || response.rdap?.registrar?.name;
  const nameservers = (
    response.whois?.nameservers ||
    response.rdap?.nameservers?.map((n) =>
      typeof n === 'string' ? n : n.ldhName
    ) ||
    []
  )
    .filter(Boolean)
    .slice(0, 12) as string[];

  const asnMap = new Map<number, string | undefined>();
  for (const ip of response.dns?.ipIntelligence || []) {
    if (ip.asn != null) asnMap.set(ip.asn, ip.asOrg);
  }

  const announced =
    options?.announced ??
    response.meta?.announced ??
    true;

  return {
    id: randomUUID(),
    domain: response.domain.toLowerCase(),
    analyzedAt: response.analyzedAt,
    overallScore,
    dnsScore: categoryScore(security, 'dns'),
    registrationScore: categoryScore(security, 'registration'),
    rdapScore: categoryScore(security, 'rdap'),
    riskLevel: riskFromScore(overallScore),
    events,
    hasWhois: Boolean(response.whois),
    hasRdap: Boolean(response.rdap),
    hasDns: Boolean(response.dns),
    hasSsl: Boolean(response.ssl),
    durationMs: response.meta?.duration,
    security: security
      ? {
          overallScore: security.overallScore,
          breakdown: security.breakdown,
          risks: security.risks,
        }
      : undefined,
    registrar: registrarName
      ? {
          name: registrarName,
          url: response.whois?.registrar?.url || response.rdap?.registrar?.url,
          ianaId:
            response.whois?.registrar?.ianaId || response.rdap?.registrar?.ianaId,
        }
      : undefined,
    nameservers,
    entities: (response.rdap?.entities || []).slice(0, 8).map((e) => {
      const orgRaw = e.org || e.fn;
      return {
        handle: e.handle,
        roles: e.roles,
        org: redactText(orgRaw) || orgRaw,
      };
    }),
    ssl: response.ssl
      ? {
          fingerprintSha256: response.ssl.fingerprintSha256,
          issuer: response.ssl.issuer,
          sans: response.ssl.sans.slice(0, 20),
          isCloudflareOriginCa: response.ssl.isCloudflareOriginCa,
          validTo: response.ssl.validTo,
        }
      : undefined,
    asnSummary: Array.from(asnMap.entries())
      .slice(0, 8)
      .map(([asn, asOrg]) => ({ asn, asOrg: redactText(asOrg) || asOrg })),
    privacy: { redacted: true, announced },
  };
}

export function snapshotKey(domain: string, id: string): string {
  return `snapshot:${domain.toLowerCase()}:${id}`;
}

export function snapshotsIndexKey(domain: string): string {
  return `snapshots:${domain.toLowerCase()}`;
}

export class SnapshotStore {
  async save(
    response: DomainAnalysisResponse,
    options?: { announced?: boolean }
  ): Promise<AnalysisSnapshot | null> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return null;
    }

    const snapshot = buildSnapshotFromAnalysis(response, options);
    const domain = snapshot.domain;
    const key = snapshotKey(domain, snapshot.id);
    const indexKey = snapshotsIndexKey(domain);
    const ttl = snapshotTtlSeconds();
    const score = Date.parse(snapshot.analyzedAt) || Date.now();

    try {
      const payload = JSON.stringify(snapshot);
      await client.setEx(key, ttl, payload);
      await client.zAdd(indexKey, { score, value: snapshot.id });
      await client.expire(indexKey, ttl);

      // Cap index size
      const count = await client.zCard(indexKey);
      if (count > MAX_SNAPSHOTS_PER_DOMAIN) {
        const removeCount = count - MAX_SNAPSHOTS_PER_DOMAIN;
        const oldIds = await client.zRange(indexKey, 0, removeCount - 1);
        if (oldIds.length > 0) {
          await client.zRemRangeByRank(indexKey, 0, removeCount - 1);
          await Promise.all(
            oldIds.map((id) => client.del(snapshotKey(domain, id)).catch(() => 0))
          );
        }
      }

      logger.debug(`Saved analysis snapshot ${snapshot.id} for ${domain}`);
      return snapshot;
    } catch (error) {
      logger.warn(`Failed to save snapshot for ${domain}:`, error);
      return null;
    }
  }

  async list(
    domain: string,
    limit = 50
  ): Promise<AnalysisSnapshot[]> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return [];
    }

    const normalized = domain.toLowerCase();
    const indexKey = snapshotsIndexKey(normalized);
    const capped = Math.min(Math.max(limit, 1), MAX_SNAPSHOTS_PER_DOMAIN);

    try {
      // Newest first
      const ids = await client.zRange(indexKey, 0, capped - 1, { REV: true });
      if (ids.length === 0) {
        return [];
      }

      const snapshots: AnalysisSnapshot[] = [];
      for (const id of ids) {
        const raw = await client.get(snapshotKey(normalized, id));
        if (!raw) continue;
        try {
          snapshots.push(JSON.parse(raw) as AnalysisSnapshot);
        } catch {
          // skip corrupt
        }
      }
      return snapshots;
    } catch (error) {
      logger.warn(`Failed to list snapshots for ${normalized}:`, error);
      return [];
    }
  }

  async get(domain: string, id: string): Promise<AnalysisSnapshot | null> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return null;
    }

    try {
      const raw = await client.get(snapshotKey(domain.toLowerCase(), id));
      if (!raw) return null;
      return JSON.parse(raw) as AnalysisSnapshot;
    } catch (error) {
      logger.warn(`Failed to get snapshot ${id}:`, error);
      return null;
    }
  }

}

export const snapshotStore = new SnapshotStore();
