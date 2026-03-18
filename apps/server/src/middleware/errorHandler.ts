import type { ErrorRequestHandler } from 'express';
import { logger } from '../config/logger.js';
import type { ApiError } from '@musicserver/shared';

/** Known safe error types that don't need a full stack trace. */
const SAFE_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422, 429]);

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const statusCode: number = typeof err.statusCode === 'number' ? err.statusCode : 500;
  const isServerError = statusCode >= 500;

  // Log internal errors with full context; client errors only as warnings
  if (isServerError) {
    logger.error('Unhandled server error', {
      method: req.method,
      url: req.url,
      statusCode,
      error: err.message,
      stack: err.stack,
    });
  } else if (!SAFE_STATUS_CODES.has(statusCode)) {
    logger.warn('Unhandled client error', {
      method: req.method,
      url: req.url,
      statusCode,
      error: err.message,
    });
  }

  const response: ApiError = {
    error: isServerError ? 'Interner Serverfehler' : (err.message || 'Fehler'),
    statusCode,
  };

  // Only expose stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.details = err.stack;
  }

  res.status(statusCode).json(response);
};
