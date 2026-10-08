import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from '@/services/cache/redisClient';
import { logger } from '@/utils/logger';

function parseOrigins(): string[] {
  const raw =
    process.env.CORS_ORIGINS ||
    process.env.FRONTEND_URL ||
    'http://localhost:4000';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function isSiteRequest(req: Request): boolean {
  const origins = parseOrigins();
  const origin = req.get('origin') || '';
  const referer = req.get('referer') || '';
  if (origin && origins.some((o) => origin === o || origin.startsWith(o))) {
    return true;
  }
  if (referer && origins.some((o) => referer.startsWith(o))) {
    return true;
  }
  return false;
}

function hasApiKey(req: Request): boolean {
  const expected = process.env.API_KEY;
  if (!expected) return false;
  const header = req.get('x-api-key');
  const auth = req.get('authorization');
  if (header && header === expected) return true;
  if (auth?.startsWith('Bearer ') && auth.slice(7) === expected) return true;
  return false;
}

function buildLimiter(max: number, prefix: string) {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
  const options: Parameters<typeof rateLimit>[0] = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    keyGenerator: (req) => `${prefix}:${req.ip || 'unknown'}`,
  };

  const redis = getRedisClient();
  if (redis?.isOpen) {
    options.store = new RedisStore({
      sendCommand: (...args: string[]) =>
        redis.sendCommand(args as [string, ...string[]]),
      prefix: `rl:${prefix}:`,
    });
  }

  return rateLimit(options);
}

const siteMax = parseInt(process.env.RATE_LIMIT_SITE_MAX || process.env.RATE_LIMIT_MAX_REQUESTS || '120', 10);
const scriptMax = parseInt(process.env.RATE_LIMIT_SCRIPT_MAX || '20', 10);
const apiKeyMax = parseInt(process.env.RATE_LIMIT_API_KEY_MAX || '200', 10);

const siteLimiter = buildLimiter(siteMax, 'site');
const scriptLimiter = buildLimiter(scriptMax, 'script');
const apiKeyLimiter = buildLimiter(apiKeyMax, 'apikey');

/**
 * Dual budget: allowlisted browser Origin/Referer vs scripted clients.
 * Valid API_KEY elevates script traffic to the API-key budget.
 */
export function siteVsScriptRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (hasApiKey(req)) {
    apiKeyLimiter(req, res, next);
    return;
  }
  if (isSiteRequest(req)) {
    siteLimiter(req, res, next);
    return;
  }
  logger.debug('Applying script rate limit (no site origin)', { ip: req.ip, path: req.path });
  scriptLimiter(req, res, next);
}

export function expensiveSiteVsScriptRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Tighter caps for analyze / ssl / CT-triggering routes
  const tightSite = buildLimiter(
    parseInt(process.env.RATE_LIMIT_EXPENSIVE_SITE_MAX || '40', 10),
    'expensive-site'
  );
  const tightScript = buildLimiter(
    parseInt(process.env.RATE_LIMIT_EXPENSIVE_SCRIPT_MAX || '5', 10),
    'expensive-script'
  );
  const tightKey = buildLimiter(
    parseInt(process.env.RATE_LIMIT_EXPENSIVE_API_KEY_MAX || '80', 10),
    'expensive-apikey'
  );

  if (hasApiKey(req)) {
    tightKey(req, res, next);
    return;
  }
  if (isSiteRequest(req)) {
    tightSite(req, res, next);
    return;
  }
  tightScript(req, res, next);
}

export { isSiteRequest, hasApiKey };
