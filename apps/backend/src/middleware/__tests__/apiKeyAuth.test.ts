import { Request, Response, NextFunction } from 'express';
import { apiKeyAuth, validateSocketApiKey } from '../apiKeyAuth';

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('apiKeyAuth', () => {
  const originalKey = process.env.API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalKey;
    }
  });

  it('passes through when API_KEY is unset', () => {
    delete process.env.API_KEY;
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    apiKeyAuth({ headers: {} } as Request, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('rejects missing key when API_KEY is set', () => {
    process.env.API_KEY = 'secret-key-value';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    apiKeyAuth(
      { headers: { 'x-request-nonce': 'abcdefgh' } } as unknown as Request,
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects short nonce', () => {
    process.env.API_KEY = 'secret-key-value';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    apiKeyAuth(
      {
        headers: { 'x-api-key': 'secret-key-value', 'x-request-nonce': 'short' },
      } as unknown as Request,
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('accepts matching key and valid nonce', () => {
    process.env.API_KEY = 'secret-key-value';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    apiKeyAuth(
      {
        headers: {
          'x-api-key': 'secret-key-value',
          'x-request-nonce': 'abcdefgh-1234',
        },
      } as unknown as Request,
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('accepts Authorization Bearer + valid nonce', () => {
    process.env.API_KEY = 'secret-key-value';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    apiKeyAuth(
      {
        headers: {
          authorization: 'Bearer secret-key-value',
          'x-request-nonce': 'abcdefgh-1234',
        },
      } as unknown as Request,
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('accepts case-insensitive Bearer scheme', () => {
    process.env.API_KEY = 'secret-key-value';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    apiKeyAuth(
      {
        headers: {
          authorization: 'bearer secret-key-value',
          'x-request-nonce': 'abcdefgh-1234',
        },
      } as unknown as Request,
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('rejects wrong Bearer token', () => {
    process.env.API_KEY = 'secret-key-value';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    apiKeyAuth(
      {
        headers: {
          authorization: 'Bearer wrong-key',
          'x-request-nonce': 'abcdefgh-1234',
        },
      } as unknown as Request,
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('prefers X-API-Key over mismatched Bearer', () => {
    process.env.API_KEY = 'secret-key-value';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    apiKeyAuth(
      {
        headers: {
          'x-api-key': 'secret-key-value',
          authorization: 'Bearer wrong-key',
          'x-request-nonce': 'abcdefgh-1234',
        },
      } as unknown as Request,
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });
});

describe('validateSocketApiKey', () => {
  const originalKey = process.env.API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalKey;
    }
  });

  it('accepts auth.apiKey + auth.nonce for local clients', () => {
    process.env.API_KEY = 'secret-key-value';
    const result = validateSocketApiKey(
      {},
      { apiKey: 'secret-key-value', nonce: 'local-nonce-01' }
    );
    expect(result.ok).toBe(true);
  });

  it('accepts nginx-injected headers', () => {
    process.env.API_KEY = 'secret-key-value';
    const result = validateSocketApiKey({
      'x-api-key': 'secret-key-value',
      'x-request-nonce': 'nginx-request-id',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts Authorization Bearer via handshake headers', () => {
    process.env.API_KEY = 'secret-key-value';
    const result = validateSocketApiKey({
      authorization: 'Bearer secret-key-value',
      'x-request-nonce': 'nginx-request-id',
    });
    expect(result.ok).toBe(true);
  });
});
