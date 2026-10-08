import NodeCache from 'node-cache';
import { logger } from '@/utils/logger';
import {
  connectRedis,
  disconnectRedis,
  getRedisClient,
  pingRedis,
} from './redisClient';

export class CacheService {
  private memoryCache: NodeCache;
  private readonly memoryCacheTtl: number;
  private readonly redisCacheTtl: number;

  constructor() {
    this.memoryCacheTtl = parseInt(process.env.CACHE_TTL_MINUTES || '5') * 60;
    this.redisCacheTtl = parseInt(process.env.REDIS_TTL_SECONDS || '3600');

    const maxKeys = parseInt(process.env.MEMORY_CACHE_SIZE || '1000');

    this.memoryCache = new NodeCache({
      stdTTL: this.memoryCacheTtl,
      checkperiod: 120,
      maxKeys,
      useClones: false,
    });
  }

  /**
   * Ensure Redis is connected (idempotent). Prefer calling connectRedis() at boot.
   */
  async ensureRedis(): Promise<void> {
    await connectRedis();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const memoryValue = this.memoryCache.get<T>(key);
      if (memoryValue !== undefined) {
        logger.debug(`Cache hit (memory): ${key}`);
        return memoryValue;
      }

      const redisClient = getRedisClient();
      if (redisClient?.isOpen) {
        try {
          const redisValue = await redisClient.get(key);
          if (redisValue !== null) {
            logger.debug(`Cache hit (Redis): ${key}`);
            const parsed = JSON.parse(redisValue) as T;
            this.memoryCache.set(key, parsed);
            return parsed;
          }
        } catch (error) {
          logger.warn(`Redis get failed for key ${key}:`, error);
        }
      }

      logger.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, customTtl?: number): Promise<void> {
    try {
      const memoryTtl = customTtl || this.memoryCacheTtl;
      const redisTtl = customTtl || this.redisCacheTtl;

      this.memoryCache.set(key, value, memoryTtl);
      logger.debug(`Cached in memory: ${key} (TTL: ${memoryTtl}s)`);

      const redisClient = getRedisClient();
      if (redisClient?.isOpen) {
        try {
          const serialized = JSON.stringify(value);
          await redisClient.setEx(key, redisTtl, serialized);
          logger.debug(`Cached in Redis: ${key} (TTL: ${redisTtl}s)`);
        } catch (error) {
          logger.warn(`Redis set failed for key ${key}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      this.memoryCache.del(key);

      const redisClient = getRedisClient();
      if (redisClient?.isOpen) {
        try {
          await redisClient.del(key);
          logger.debug(`Deleted from cache: ${key}`);
        } catch (error) {
          logger.warn(`Redis delete failed for key ${key}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      this.memoryCache.flushAll();

      const redisClient = getRedisClient();
      if (redisClient?.isOpen) {
        try {
          await redisClient.flushDb();
          logger.info('Cleared all cached data');
        } catch (error) {
          logger.warn('Redis clear failed:', error);
        }
      }
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  }

  getStats(): {
    memory: {
      keys: number;
      hits: number;
      misses: number;
      ksize: number;
      vsize: number;
    };
    redis: {
      connected: boolean;
    };
  } {
    const memoryStats = this.memoryCache.getStats();

    return {
      memory: {
        keys: memoryStats.keys,
        hits: memoryStats.hits,
        misses: memoryStats.misses,
        ksize: memoryStats.ksize,
        vsize: memoryStats.vsize,
      },
      redis: {
        connected: getRedisClient()?.isOpen || false,
      },
    };
  }

  static generateDomainKey(domain: string, analysisType?: string): string {
    const type = analysisType || 'full';
    return `domain:${domain.toLowerCase()}:${type}`;
  }

  static generateDnsKey(domain: string, recordType?: string): string {
    const type = recordType || 'all';
    return `dns:${domain.toLowerCase()}:${type}`;
  }

  static generateWhoisKey(domain: string): string {
    return `whois:${domain.toLowerCase()}`;
  }

  static generateRdapKey(domain: string): string {
    return `rdap:${domain.toLowerCase()}`;
  }

  async close(): Promise<void> {
    try {
      this.memoryCache.close();
      // Shared Redis client is closed at process shutdown via disconnectRedis()
      logger.info('Cache service closed');
    } catch (error) {
      logger.error('Error closing cache service:', error);
    }
  }

  async healthCheck(): Promise<{
    memory: boolean;
    redis: boolean;
  }> {
    const health = {
      memory: true,
      redis: false,
    };

    try {
      const testKey = 'health-check';
      const testValue = { timestamp: Date.now() };

      this.memoryCache.set(testKey, testValue, 10);
      const retrieved = this.memoryCache.get(testKey);
      health.memory = retrieved !== undefined;

      this.memoryCache.del(testKey);

      health.redis = await pingRedis();
    } catch {
      health.memory = false;
    }

    return health;
  }
}

// Re-export disconnect for callers that previously closed via CacheService
export { disconnectRedis };
