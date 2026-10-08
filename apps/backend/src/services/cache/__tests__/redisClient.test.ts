import {
  resolveRedisUrl,
  isRedisConfigured,
  _resetRedisClientForTests,
} from '../redisClient';

describe('redisClient URL resolution', () => {
  const envKeys = [
    'REDIS_URL',
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
  ] as const;
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    _resetRedisClientForTests();
    for (const key of envKeys) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
    _resetRedisClientForTests();
  });

  it('returns null when Redis is not configured', () => {
    expect(resolveRedisUrl()).toBeNull();
    expect(isRedisConfigured()).toBe(false);
  });

  it('uses REDIS_URL when set', () => {
    process.env.REDIS_URL = 'redis://redis:6379';
    expect(resolveRedisUrl()).toBe('redis://redis:6379');
    expect(isRedisConfigured()).toBe(true);
  });

  it('builds URL from HOST/PORT', () => {
    process.env.REDIS_HOST = 'redis';
    process.env.REDIS_PORT = '6379';
    expect(resolveRedisUrl()).toBe('redis://redis:6379');
  });

  it('injects REDIS_PASSWORD into URL without auth', () => {
    process.env.REDIS_URL = 'redis://redis:6379';
    process.env.REDIS_PASSWORD = 's3cret';
    const url = resolveRedisUrl();
    expect(url).toContain('s3cret');
    expect(url).toContain('redis');
  });

  it('does not overwrite existing URL auth', () => {
    process.env.REDIS_URL = 'redis://:already@redis:6379';
    process.env.REDIS_PASSWORD = 'other';
    expect(resolveRedisUrl()).toBe('redis://:already@redis:6379');
  });

  it('builds URL with password from host parts', () => {
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_PASSWORD = 'pw';
    expect(resolveRedisUrl()).toBe('redis://:pw@localhost:6379');
  });
});
