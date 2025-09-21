import NodeCache from 'node-cache';
import { createClient, RedisClientType } from 'redis';
import { logger } from '@/utils/logger';

export class CacheService {
  private memoryCache: NodeCache;
  private redisClient: RedisClientType | null = null;
  private readonly memoryCacheTtl: number;
  private readonly redisCacheTtl: number;

  constructor() {
    // Initialize in-memory cache
    this.memoryCacheTtl = parseInt(process.env.CACHE_TTL_MINUTES || '5') * 60; // 5 minutes in seconds
    this.redisCacheTtl = parseInt(process.env.REDIS_TTL_SECONDS || '3600'); // 1 hour
    
    const maxKeys = parseInt(process.env.MEMORY_CACHE_SIZE || '1000');
    
    this.memoryCache = new NodeCache({
      stdTTL: this.memoryCacheTtl,
      checkperiod: 120, // Check for expired keys every 2 minutes
      maxKeys,
      useClones: false, // Better performance, but be careful with object mutations
    });

    // Initialize Redis client if configured
    this.initializeRedis();
  }

  /**
   * Initialize Redis client
   */
  private async initializeRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      logger.info('Redis not configured, using memory cache only');
      return;
    }

    try {
      this.redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
        },
      });

      this.redisClient.on('error', (error) => {
        logger.error('Redis error:', error);
      });

      this.redisClient.on('connect', () => {
        logger.info('Connected to Redis');
      });

      this.redisClient.on('disconnect', () => {
        logger.warn('Disconnected from Redis');
      });

      await this.redisClient.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      this.redisClient = null;
    }
  }

  /**
   * Get value from cache (checks memory first, then Redis)
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // First check memory cache
      const memoryValue = this.memoryCache.get<T>(key);
      if (memoryValue !== undefined) {
        logger.debug(`Cache hit (memory): ${key}`);
        return memoryValue;
      }

      // Then check Redis if available
      if (this.redisClient?.isOpen) {
        try {
          const redisValue = await this.redisClient.get(key);
          if (redisValue !== null) {
            logger.debug(`Cache hit (Redis): ${key}`);
            const parsed = JSON.parse(redisValue) as T;
            
            // Store in memory cache for faster future access
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

  /**
   * Set value in cache (stores in both memory and Redis)
   */
  async set<T>(key: string, value: T, customTtl?: number): Promise<void> {
    try {
      const memoryTtl = customTtl || this.memoryCacheTtl;
      const redisTtl = customTtl || this.redisCacheTtl;

      // Store in memory cache
      this.memoryCache.set(key, value, memoryTtl);
      logger.debug(`Cached in memory: ${key} (TTL: ${memoryTtl}s)`);

      // Store in Redis if available
      if (this.redisClient?.isOpen) {
        try {
          const serialized = JSON.stringify(value);
          await this.redisClient.setEx(key, redisTtl, serialized);
          logger.debug(`Cached in Redis: ${key} (TTL: ${redisTtl}s)`);
        } catch (error) {
          logger.warn(`Redis set failed for key ${key}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      // Delete from memory cache
      this.memoryCache.del(key);
      
      // Delete from Redis if available
      if (this.redisClient?.isOpen) {
        try {
          await this.redisClient.del(key);
          logger.debug(`Deleted from cache: ${key}`);
        } catch (error) {
          logger.warn(`Redis delete failed for key ${key}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    try {
      // Clear memory cache
      this.memoryCache.flushAll();
      
      // Clear Redis if available
      if (this.redisClient?.isOpen) {
        try {
          await this.redisClient.flushDb();
          logger.info('Cleared all cached data');
        } catch (error) {
          logger.warn('Redis clear failed:', error);
        }
      }
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
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
        connected: this.redisClient?.isOpen || false,
      },
    };
  }

  /**
   * Generate cache key for domain analysis
   */
  static generateDomainKey(domain: string, analysisType?: string): string {
    const type = analysisType || 'full';
    return `domain:${domain.toLowerCase()}:${type}`;
  }

  /**
   * Generate cache key for DNS records
   */
  static generateDnsKey(domain: string, recordType?: string): string {
    const type = recordType || 'all';
    return `dns:${domain.toLowerCase()}:${type}`;
  }

  /**
   * Generate cache key for WHOIS data
   */
  static generateWhoisKey(domain: string): string {
    return `whois:${domain.toLowerCase()}`;
  }

  /**
   * Generate cache key for RDAP data
   */
  static generateRdapKey(domain: string): string {
    return `rdap:${domain.toLowerCase()}`;
  }

  /**
   * Close connections and cleanup
   */
  async close(): Promise<void> {
    try {
      this.memoryCache.close();
      
      if (this.redisClient?.isOpen) {
        await this.redisClient.disconnect();
      }
      
      logger.info('Cache service closed');
    } catch (error) {
      logger.error('Error closing cache service:', error);
    }
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<{
    memory: boolean;
    redis: boolean;
  }> {
    const health = {
      memory: true,
      redis: false,
    };

    try {
      // Test memory cache
      const testKey = 'health-check';
      const testValue = { timestamp: Date.now() };
      
      this.memoryCache.set(testKey, testValue, 10);
      const retrieved = this.memoryCache.get(testKey);
      health.memory = retrieved !== undefined;
      
      this.memoryCache.del(testKey);

      // Test Redis if available
      if (this.redisClient?.isOpen) {
        try {
          await this.redisClient.ping();
          health.redis = true;
        } catch (error) {
          health.redis = false;
        }
      }
    } catch (error) {
      health.memory = false;
    }

    return health;
  }
}