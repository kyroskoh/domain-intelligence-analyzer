import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from './errorHandler';

export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.originalUrl}`);
  next(error);
};