import type { ErrorRequestHandler } from 'express';
import type { ApiError } from '@musicserver/shared';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('Unhandled error:', err);

  const statusCode = err.statusCode || 500;
  const response: ApiError = {
    error: err.message || 'Internal Server Error',
    statusCode,
  };

  if (process.env.NODE_ENV === 'development') {
    response.details = err.stack;
  }

  res.status(statusCode).json(response);
};
