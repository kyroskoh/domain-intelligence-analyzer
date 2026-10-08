import { logger } from '@/utils/logger';
import { AnalysisSnapshot } from './SnapshotStore';
import { CacheService } from './CacheService';
import { connectRedis, getRedisClient } from './redisClient';

export interface AnalyzedAllEntry {
  domain: string;
  snapshotId: string;
  analyzedAt: string;
  announced: boolean;
  overallScore: number;
  riskLevel: AnalysisSnapshot['riskLevel'];
  shareToken?: string;
  /** Member identity in ZSET: domain:snapshotId */
  member: string;
}

export interface AnalyzedAllListItem extends AnalyzedAllEntry {
  inCache: boolean;
}

const ALL_KEY = 'analyzed:all';
const DETAIL_PREFIX = 'analyzed:detail:';
const MAX_ALL = 5000;

function detailKey(member: string): string {
  return `${DETAIL_PREFIX}${member}`;
}

function memberId(domain: string, snapshotId: string): string {
  return `${domain.toLowerCase()}:${snapshotId}`;
}

function snapshotTtlSeconds(): number {
  return parseInt(process.env.SNAPSHOT_TTL_SECONDS || String(30 * 24 * 3600), 10);
}

export class AnalyzedAllStore {
  async record(
    snapshot: AnalysisSnapshot,
    options?: { shareToken?: string }
  ): Promise<AnalyzedAllEntry | null> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return null;
    }

    const domain = snapshot.domain.toLowerCase();
    const member = memberId(domain, snapshot.id);
    const announced = snapshot.privacy?.announced !== false;
    const entry: AnalyzedAllEntry = {
      domain,
      snapshotId: snapshot.id,
      analyzedAt: snapshot.analyzedAt,
      announced,
      overallScore: snapshot.overallScore,
      riskLevel: snapshot.riskLevel,
      shareToken: options?.shareToken,
      member,
    };

    const score = Date.parse(snapshot.analyzedAt) || Date.now();
    const ttl = snapshotTtlSeconds();

    try {
      await client.setEx(detailKey(member), ttl, JSON.stringify(entry));
      await client.zAdd(ALL_KEY, { score, value: member });
      await client.expire(ALL_KEY, ttl);

      const count = await client.zCard(ALL_KEY);
      if (count > MAX_ALL) {
        const removeCount = count - MAX_ALL;
        const old = await client.zRange(ALL_KEY, 0, removeCount - 1);
        if (old.length > 0) {
          await client.zRemRangeByRank(ALL_KEY, 0, removeCount - 1);
          await Promise.all(old.map((m) => client.del(detailKey(m)).catch(() => 0)));
        }
      }

      return entry;
    } catch (error) {
      logger.warn(`Failed to record analyzed:all for ${domain}:`, error);
      return null;
    }
  }

  async list(limit = 200): Promise<AnalyzedAllListItem[]> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return [];
    }

    const capped = Math.min(Math.max(limit, 1), MAX_ALL);

    try {
      const members = await client.zRange(ALL_KEY, 0, capped - 1, { REV: true });
      const items: AnalyzedAllListItem[] = [];

      for (const member of members) {
        const raw = await client.get(detailKey(member));
        if (!raw) {
          await client.zRem(ALL_KEY, member);
          continue;
        }
        try {
          const entry = JSON.parse(raw) as AnalyzedAllEntry;
          const cacheKey = CacheService.generateDomainKey(entry.domain);
          const inCache = (await client.exists(cacheKey)) === 1;
          items.push({ ...entry, inCache });
        } catch {
          await client.zRem(ALL_KEY, member);
          await client.del(detailKey(member));
        }
      }

      return items;
    } catch (error) {
      logger.warn('Failed to list analyzed:all:', error);
      return [];
    }
  }
}

export const analyzedAllStore = new AnalyzedAllStore();
