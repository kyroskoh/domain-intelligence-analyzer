import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from './errorHandler';

// Domain name validation schema
const domainSchema = Joi.string()
  .min(1)
  .max(253)
  .pattern(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/)
  .required()
  .messages({
    'string.pattern.base': 'Invalid domain name format',
    'string.min': 'Domain name is too short',
    'string.max': 'Domain name is too long',
    'any.required': 'Domain name is required',
  });

// IP address validation schema (IPv4 and IPv6)
const ipSchema = Joi.alternatives().try(
  Joi.string().ip({ version: ['ipv4', 'ipv6'] })
).required().messages({
  'alternatives.match': 'Invalid IP address format',
  'any.required': 'IP address is required',
});

export const validateDomain = (req: Request, res: Response, next: NextFunction): void => {
  const { domain } = req.params;
  
  const { error } = domainSchema.validate(domain);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }
  
  next();
};

export const validateIP = (req: Request, res: Response, next: NextFunction): void => {
  const { ip } = req.params;
  
  const { error } = ipSchema.validate(ip);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }
  
  next();
};

export const validateDomainOrIP = (req: Request, res: Response, next: NextFunction): void => {
  const { target } = req.params;
  
  // Try domain validation first
  const domainValidation = domainSchema.validate(target);
  if (!domainValidation.error) {
    req.params.type = 'domain';
    return next();
  }
  
  // Try IP validation
  const ipValidation = ipSchema.validate(target);
  if (!ipValidation.error) {
    req.params.type = 'ip';
    return next();
  }
  
  throw new ValidationError('Target must be a valid domain name or IP address');
};

export const validateQueryParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.query);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }
    next();
  };
};

export const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }
    next();
  };
};