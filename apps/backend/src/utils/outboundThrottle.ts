import { logger } from '@/utils/logger';

type GateState = {
  lastAt: number;
  inflight: number;
  queue: Array<() => void>;
};

const gates = new Map<string, GateState>();

function getGate(provider: string): GateState {
  let g = gates.get(provider);
  if (!g) {
    g = { lastAt: 0, inflight: 0, queue: [] };
    gates.set(provider, g);
  }
  return g;
}

function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Serialize / pace outbound calls to third-party providers (ip-api, bgp.he.net, crt.sh).
 */
export async function withOutboundThrottle<T>(
  provider: string,
  fn: () => Promise<T>,
  opts?: { minIntervalMs?: number; maxConcurrency?: number }
): Promise<T> {
  const minIntervalMs =
    opts?.minIntervalMs ??
    envInt(`${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MIN_INTERVAL_MS`, 500);
  const maxConcurrency =
    opts?.maxConcurrency ??
    envInt(`${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_MAX_CONCURRENCY`, 1);

  const gate = getGate(provider);

  await new Promise<void>((resolve) => {
    const tryAcquire = () => {
      const now = Date.now();
      const wait = Math.max(0, gate.lastAt + minIntervalMs - now);
      if (gate.inflight < maxConcurrency && wait === 0) {
        gate.inflight += 1;
        gate.lastAt = Date.now();
        resolve();
        return;
      }
      setTimeout(() => {
        if (gate.inflight < maxConcurrency) {
          gate.inflight += 1;
          gate.lastAt = Date.now();
          resolve();
        } else {
          gate.queue.push(tryAcquire);
        }
      }, Math.max(wait, 25));
    };
    if (gate.inflight >= maxConcurrency) {
      gate.queue.push(tryAcquire);
    } else {
      tryAcquire();
    }
  });

  try {
    return await fn();
  } finally {
    gate.inflight = Math.max(0, gate.inflight - 1);
    const next = gate.queue.shift();
    if (next) next();
  }
}

export async function cachedJsonFetch<T>(
  cacheKey: string,
  ttlSeconds: number,
  provider: string,
  fetchFn: () => Promise<T>,
  redisGet: (key: string) => Promise<string | null>,
  redisSet: (key: string, ttl: number, value: string) => Promise<void>
): Promise<T> {
  try {
    const hit = await redisGet(cacheKey);
    if (hit) {
      return JSON.parse(hit) as T;
    }
  } catch (error) {
    logger.debug(`Cache read failed for ${cacheKey}:`, error);
  }

  const value = await withOutboundThrottle(provider, fetchFn);

  try {
    await redisSet(cacheKey, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.debug(`Cache write failed for ${cacheKey}:`, error);
  }

  return value;
}
