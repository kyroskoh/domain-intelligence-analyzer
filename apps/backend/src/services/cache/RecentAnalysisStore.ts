import { logger } from '@/utils/logger';
import { AnalysisSnapshot, snapshotStore } from './SnapshotStore';
import { connectRedis, getRedisClient } from './redisClient';
import { shareStore } from './ShareStore';

export interface RecentAnalysisEntry {
  domain: string;
  snapshotId: string;
  analyzedAt: string;
  overallScore: number;
  riskLevel: AnalysisSnapshot['riskLevel'];
  shareToken: string;
  sharePath: string;
}

const RECENT_KEY = 'recent:announced';
const MAX_RECENT = 50;
const DETAIL_PREFIX = 'recent:detail:';

function detailKey(domain: string): string {
  return `${DETAIL_PREFIX}${domain.toLowerCase()}`;
}

function snapshotTtlSeconds(): number {
  return parseInt(process.env.SNAPSHOT_TTL_SECONDS || String(30 * 24 * 3600), 10);
}

export class RecentAnalysisStore {
  /**
   * Upsert latest announced analysis for a domain (unique domain members).
   */
  async announce(snapshot: AnalysisSnapshot): Promise<RecentAnalysisEntry | null> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return null;
    }

    const domain = snapshot.domain.toLowerCase();
    const share = await shareStore.create(domain, snapshot.id, snapshotTtlSeconds());
    if (!share) {
      logger.warn(`Could not mint share token for announced ${domain}`);
      return null;
    }

    const entry: RecentAnalysisEntry = {
      domain,
      snapshotId: snapshot.id,
      analyzedAt: snapshot.analyzedAt,
      overallScore: snapshot.overallScore,
      riskLevel: snapshot.riskLevel,
      shareToken: share.token,
      sharePath: share.urlPath,
    };

    const score = Date.parse(snapshot.analyzedAt) || Date.now();
    const ttl = snapshotTtlSeconds();

    try {
      await client.setEx(detailKey(domain), ttl, JSON.stringify(entry));
      await client.zAdd(RECENT_KEY, { score, value: domain });
      await client.expire(RECENT_KEY, ttl);

      const count = await client.zCard(RECENT_KEY);
      if (count > MAX_RECENT) {
        const removeCount = count - MAX_RECENT;
        const oldDomains = await client.zRange(RECENT_KEY, 0, removeCount - 1);
        if (oldDomains.length > 0) {
          await client.zRemRangeByRank(RECENT_KEY, 0, removeCount - 1);
          await Promise.all(
            oldDomains.map((d) => client.del(detailKey(d)).catch(() => 0))
          );
        }
      }

      return entry;
    } catch (error) {
      logger.warn(`Failed to announce recent analysis for ${domain}:`, error);
      return null;
    }
  }

  /**
   * List recent announced domains (newest first), pruning dead snapshot/share links.
   */
  async list(limit = 50): Promise<RecentAnalysisEntry[]> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return [];
    }

    const capped = Math.min(Math.max(limit, 1), MAX_RECENT);

    try {
      const domains = await client.zRange(RECENT_KEY, 0, capped * 2 - 1, { REV: true });
      const entries: RecentAnalysisEntry[] = [];

      for (const domain of domains) {
        if (entries.length >= capped) break;

        const raw = await client.get(detailKey(domain));
        if (!raw) {
          await client.zRem(RECENT_KEY, domain);
          continue;
        }

        let entry: RecentAnalysisEntry;
        try {
          entry = JSON.parse(raw) as RecentAnalysisEntry;
        } catch {
          await client.zRem(RECENT_KEY, domain);
          await client.del(detailKey(domain));
          continue;
        }

        const snapshot = await snapshotStore.get(entry.domain, entry.snapshotId);
        const shareOk = await shareStore.resolve(entry.shareToken);
        if (!snapshot || !shareOk) {
          await client.zRem(RECENT_KEY, domain);
          await client.del(detailKey(domain));
          continue;
        }

        entries.push(entry);
      }

      return entries;
    } catch (error) {
      logger.warn('Failed to list recent analyses:', error);
      return [];
    }
  }
}

export const recentAnalysisStore = new RecentAnalysisStore();
