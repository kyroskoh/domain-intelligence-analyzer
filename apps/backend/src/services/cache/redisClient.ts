import { createClient, RedisClientType } from 'redis';
import { logger } from '@/utils/logger';

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

/**
 * True when REDIS_URL or REDIS_HOST is set (Redis expected).
 */
export function isRedisConfigured(): boolean {
  return resolveRedisUrl() !== null;
}

/**
 * Resolve connection URL from REDIS_URL and/or HOST/PORT/PASSWORD.
 * Injects REDIS_PASSWORD into REDIS_URL when the URL has no auth userinfo.
 */
export function resolveRedisUrl(): string | null {
  const password = process.env.REDIS_PASSWORD?.trim() || '';
  const rawUrl = process.env.REDIS_URL?.trim();

  if (rawUrl) {
    if (password && !urlHasAuth(rawUrl)) {
      try {
        const parsed = new URL(rawUrl);
        parsed.password = password;
        return parsed.toString();
      } catch {
        return rawUrl;
      }
    }
    return rawUrl;
  }

  const host = process.env.REDIS_HOST?.trim();
  if (!host) {
    return null;
  }

  const port = process.env.REDIS_PORT?.trim() || '6379';
  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}

function urlHasAuth(url: string): boolean {
  try {
    const parsed = new URL(url);
    return Boolean(parsed.username || parsed.password);
  } catch {
    return false;
  }
}

export function getRedisClient(): RedisClientType | null {
  return client;
}

/**
 * Connect singleton Redis client. Safe to call multiple times.
 * Returns null when Redis is not configured or connection fails.
 */
export async function connectRedis(): Promise<RedisClientType | null> {
  if (client?.isOpen) {
    return client;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = doConnect();
  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

async function doConnect(): Promise<RedisClientType | null> {
  const url = resolveRedisUrl();
  if (!url) {
    logger.info('Redis not configured, using memory cache only');
    return null;
  }

  try {
    const next = createClient({
      url,
      socket: {
        connectTimeout: 5000,
      },
    });

    next.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    next.on('connect', () => {
      logger.info('Connected to Redis');
    });

    next.on('end', () => {
      logger.warn('Disconnected from Redis');
    });

    await next.connect();
    client = next as RedisClientType;
    return client;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    client = null;
    return null;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) {
    return;
  }

  try {
    if (client.isOpen) {
      await client.quit();
    }
  } catch (error) {
    logger.warn('Error disconnecting Redis:', error);
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  } finally {
    client = null;
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const c = client?.isOpen ? client : await connectRedis();
    if (!c?.isOpen) {
      return false;
    }
    const result = await c.ping();
    return result === 'PONG';
  } catch (error) {
    logger.warn('Redis ping failed:', error);
    return false;
  }
}

/** Test helper: reset singleton state between tests */
export function _resetRedisClientForTests(): void {
  client = null;
  connectPromise = null;
}
