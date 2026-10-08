import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';

const MIN_NONCE_LENGTH = 8;

function getConfiguredApiKey(): string | undefined {
  const key = process.env.API_KEY?.trim();
  return key ? key : undefined;
}

function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * When API_KEY is set, require X-API-Key (matching) and X-Request-Nonce (present).
 * Nginx injects both for proxied /api/ and /socket.io/ traffic.
 * No-op when API_KEY is unset (local/dev without auth).
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = getConfiguredApiKey();
  if (!expectedKey) {
    next();
    return;
  }

  const providedKey = String(req.headers['x-api-key'] || '').trim();
  const nonce = String(req.headers['x-request-nonce'] || '').trim();

  if (!providedKey || !safeEqualString(providedKey, expectedKey)) {
    res.status(401).json({
      error: 'Invalid or missing API key',
      code: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (nonce.length < MIN_NONCE_LENGTH) {
    res.status(401).json({
      error: 'Missing or invalid request nonce',
      code: 'UNAUTHORIZED',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}

export function isApiKeyConfigured(): boolean {
  return Boolean(getConfiguredApiKey());
}

export function validateSocketApiKey(headers: Record<string, unknown>, auth?: {
  apiKey?: string;
  nonce?: string;
}): { ok: true } | { ok: false; message: string } {
  const expectedKey = getConfiguredApiKey();
  if (!expectedKey) {
    return { ok: true };
  }

  const headerKey = String(headers['x-api-key'] ?? headers['X-API-Key'] ?? '').trim();
  const authKey = String(auth?.apiKey ?? '').trim();
  const providedKey = headerKey || authKey;

  const headerNonce = String(
    headers['x-request-nonce'] ?? headers['X-Request-Nonce'] ?? ''
  ).trim();
  const authNonce = String(auth?.nonce ?? '').trim();
  const nonce = headerNonce || authNonce;

  if (!providedKey || !safeEqualString(providedKey, expectedKey)) {
    return { ok: false, message: 'Invalid or missing API key' };
  }

  if (nonce.length < MIN_NONCE_LENGTH) {
    return { ok: false, message: 'Missing or invalid request nonce' };
  }

  return { ok: true };
}
