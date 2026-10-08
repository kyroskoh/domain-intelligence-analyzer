import { Request, Response, NextFunction } from 'express';

function normalizeIp(raw?: string | null): string {
  return (raw || '').replace(/^::ffff:/, '').trim();
}

function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function isRfc1918(ip: string): boolean {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
  if (m) {
    const second = parseInt(m[1], 10);
    return second >= 16 && second <= 31;
  }
  return false;
}

/**
 * Guard for /api/internal/* — loopback (and optional Docker bridge) only.
 * Rejects requests that arrived via public proxy (X-Forwarded-For present).
 */
export function internalOnly(req: Request, res: Response, next: NextFunction): void {
  if (process.env.INTERNAL_ANALYZED_LIST !== '1') {
    res.status(404).json({
      error: 'Not found',
      code: 'NOT_FOUND',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const xff = req.get('x-forwarded-for');
  if (xff) {
    res.status(403).json({
      error: 'Internal endpoint not available via public proxy',
      code: 'INTERNAL_ONLY',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const ip = normalizeIp(req.socket.remoteAddress || req.ip);
  const allowDocker = process.env.ALLOW_DOCKER_INTERNAL_LIST === '1';

  if (isLoopback(ip) || (allowDocker && isRfc1918(ip))) {
    next();
    return;
  }

  res.status(403).json({
    error: 'Internal endpoint restricted to localhost/Docker',
    code: 'INTERNAL_ONLY',
    timestamp: new Date().toISOString(),
  });
}
