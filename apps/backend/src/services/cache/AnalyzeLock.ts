import { logger } from '@/utils/logger';
import { connectRedis, getRedisClient } from './redisClient';

const DEFAULT_LOCK_TTL_MS = 60_000;
const WAIT_POLL_MS = 250;
const WAIT_MAX_MS = 15_000;

function lockKey(domain: string): string {
  return `lock:analyze:${domain.toLowerCase()}`;
}

function lockTtlMs(): number {
  return parseInt(process.env.ANALYZE_LOCK_TTL_MS || String(DEFAULT_LOCK_TTL_MS), 10);
}

/**
 * Short-lived Redis lock to prevent concurrent noCache stampedes for one domain.
 * Falls open (always acquires) when Redis is unavailable.
 */
export class AnalyzeLock {
  async tryAcquire(domain: string): Promise<{ acquired: boolean; token: string }> {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) {
      return { acquired: true, token };
    }

    try {
      const result = await client.set(lockKey(domain), token, {
        NX: true,
        PX: lockTtlMs(),
      });
      return { acquired: result === 'OK', token };
    } catch (error) {
      logger.warn(`Analyze lock acquire failed for ${domain}:`, error);
      return { acquired: true, token };
    }
  }

  async release(domain: string, token: string): Promise<void> {
    const client = getRedisClient();
    if (!client?.isOpen) return;

    const key = lockKey(domain);
    try {
      const current = await client.get(key);
      if (current === token) {
        await client.del(key);
      }
    } catch (error) {
      logger.warn(`Analyze lock release failed for ${domain}:`, error);
    }
  }

  /**
   * Wait until lock is free or timeout. Returns true if lock appears free.
   */
  async waitUntilFree(domain: string, maxMs = WAIT_MAX_MS): Promise<boolean> {
    const client = getRedisClient() ?? (await connectRedis());
    if (!client?.isOpen) return true;

    const key = lockKey(domain);
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      try {
        const held = await client.exists(key);
        if (!held) return true;
      } catch {
        return true;
      }
      await sleep(WAIT_POLL_MS);
    }
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const analyzeLock = new AnalyzeLock();
