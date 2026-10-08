import { randomUUID } from 'crypto';
import { logger } from '@/utils/logger';
import { DomainAnalysisResponse, SecurityAnalysis } from '@/types/domain';
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
  durationMs?: number;
  /** Compact payload for share/detail views */
  security?: Pick<SecurityAnalysis, 'overallScore' | 'breakdown' | 'risks'>;
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
  response: DomainAnalysisResponse
): AnalysisSnapshot {
  const security = response.security;
  const overallScore = security?.overallScore ?? 0;
  const events =
    security?.risks?.slice(0, 5).map((r) => r.title || r.description).filter(Boolean) || [];

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
    durationMs: response.meta?.duration,
    security: security
      ? {
          overallScore: security.overallScore,
          breakdown: security.breakdown,
          risks: security.risks,
        }
      : undefined,
  };
}

export function snapshotKey(domain: string, id: string): string {
  return `snapshot:${domain.toLowerCase()}:${id}`;
}

export function snapshotsIndexKey(domain: string): string {
  return `snapshots:${domain.toLowerCase()}`;
}

export class SnapshotStore {
  async save(response: DomainAnalysisResponse): Promise<AnalysisSnapshot | null> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return null;
    }

    const snapshot = buildSnapshotFromAnalysis(response);
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
