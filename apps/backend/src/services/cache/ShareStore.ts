import { randomBytes } from 'crypto';
import { logger } from '@/utils/logger';
import { AnalysisSnapshot, snapshotStore } from './SnapshotStore';
import { connectRedis, getRedisClient, isRedisConfigured } from './redisClient';

export interface ShareRecord {
  token: string;
  domain: string;
  snapshotId: string;
  createdAt: string;
  expiresAt: string;
}

function shareTtlSeconds(): number {
  return parseInt(process.env.SHARE_TTL_SECONDS || String(7 * 24 * 3600), 10);
}

function shareKey(token: string): string {
  return `share:${token}`;
}

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export class ShareStore {
  isAvailable(): boolean {
    return isRedisConfigured() && Boolean(getRedisClient()?.isOpen);
  }

  async create(domain: string, snapshotId?: string): Promise<{
    token: string;
    urlPath: string;
    expiresAt: string;
    snapshot: AnalysisSnapshot;
  } | null> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return null;
    }

    const normalized = domain.toLowerCase();
    let snapshot: AnalysisSnapshot | null = null;

    if (snapshotId) {
      snapshot = await snapshotStore.get(normalized, snapshotId);
    }
    if (!snapshot) {
      const list = await snapshotStore.list(normalized, 1);
      snapshot = list[0] || null;
    }
    if (!snapshot) {
      return null;
    }

    const token = newToken();
    const ttl = shareTtlSeconds();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const record: ShareRecord = {
      token,
      domain: normalized,
      snapshotId: snapshot.id,
      createdAt,
      expiresAt,
    };

    try {
      await client.setEx(shareKey(token), ttl, JSON.stringify(record));
      return {
        token,
        urlPath: `/share/${token}`,
        expiresAt,
        snapshot,
      };
    } catch (error) {
      logger.warn('Failed to create share token:', error);
      return null;
    }
  }

  async resolve(token: string): Promise<{
    record: ShareRecord;
    snapshot: AnalysisSnapshot;
  } | null> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return null;
    }

    try {
      const raw = await client.get(shareKey(token));
      if (!raw) {
        return null;
      }
      const record = JSON.parse(raw) as ShareRecord;
      const snapshot = await snapshotStore.get(record.domain, record.snapshotId);
      if (!snapshot) {
        return null;
      }
      return { record, snapshot };
    } catch (error) {
      logger.warn('Failed to resolve share token:', error);
      return null;
    }
  }
}

export const shareStore = new ShareStore();
