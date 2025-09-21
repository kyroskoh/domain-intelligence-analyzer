import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export class DomainError extends Error implements AppError {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 400, code?: string) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
    this.code = code || 'DOMAIN_ERROR';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class TimeoutError extends DomainError {
  constructor(service: string) {
    super(`${service} request timed out`, 408, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

export class RateLimitError extends DomainError {
  constructor() {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const {
    statusCode = 500,
    message,
    code = 'INTERNAL_SERVER_ERROR',
    stack,
  } = err;

  // Log error
  logger.error(`${code}: ${message}`, {
    error: err,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    stack: process.env.NODE_ENV === 'development' ? stack : undefined,
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const response: any = {
    error: message,
    code,
    timestamp: new Date().toISOString(),
  };

  if (isDevelopment) {
    response.stack = stack;
    response.path = req.path;
  }

  res.status(statusCode).json(response);
};