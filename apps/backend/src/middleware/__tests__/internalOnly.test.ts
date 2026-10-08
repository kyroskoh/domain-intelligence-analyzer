import { Request, Response, NextFunction } from 'express';
import { internalOnly } from '../internalOnly';

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

describe('internalOnly', () => {
  const origInternal = process.env.INTERNAL_ANALYZED_LIST;
  const origDocker = process.env.ALLOW_DOCKER_INTERNAL_LIST;

  afterEach(() => {
    if (origInternal === undefined) delete process.env.INTERNAL_ANALYZED_LIST;
    else process.env.INTERNAL_ANALYZED_LIST = origInternal;
    if (origDocker === undefined) delete process.env.ALLOW_DOCKER_INTERNAL_LIST;
    else process.env.ALLOW_DOCKER_INTERNAL_LIST = origDocker;
  });

  it('returns 404 when feature flag off', () => {
    delete process.env.INTERNAL_ANALYZED_LIST;
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    internalOnly(
      {
        get: () => undefined,
        socket: { remoteAddress: '127.0.0.1' },
        ip: '127.0.0.1',
      } as unknown as Request,
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('allows loopback when enabled', () => {
    process.env.INTERNAL_ANALYZED_LIST = '1';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    internalOnly(
      {
        get: () => undefined,
        socket: { remoteAddress: '127.0.0.1' },
        ip: '127.0.0.1',
      } as unknown as Request,
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('rejects when X-Forwarded-For is present', () => {
    process.env.INTERNAL_ANALYZED_LIST = '1';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    internalOnly(
      {
        get: (h: string) => (h.toLowerCase() === 'x-forwarded-for' ? '8.8.8.8' : undefined),
        socket: { remoteAddress: '127.0.0.1' },
        ip: '127.0.0.1',
      } as unknown as Request,
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('allows RFC1918 when Docker flag set', () => {
    process.env.INTERNAL_ANALYZED_LIST = '1';
    process.env.ALLOW_DOCKER_INTERNAL_LIST = '1';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    internalOnly(
      {
        get: () => undefined,
        socket: { remoteAddress: '172.18.0.5' },
        ip: '172.18.0.5',
      } as unknown as Request,
      res,
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('rejects public IP', () => {
    process.env.INTERNAL_ANALYZED_LIST = '1';
    const next = jest.fn() as NextFunction;
    const res = mockRes();
    internalOnly(
      {
        get: () => undefined,
        socket: { remoteAddress: '8.8.8.8' },
        ip: '8.8.8.8',
      } as unknown as Request,
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
