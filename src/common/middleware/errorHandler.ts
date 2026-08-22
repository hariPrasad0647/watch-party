import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error({ err: error, reqId: request.id }, error.message);
  if (process.env.NODE_ENV === 'test') {
    console.error('[TEST ERROR]', error);
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: error.errors
      }
    });
  }

  // Handle Fastify built-in errors (e.g., rate limit)
  if ((error as FastifyError).statusCode) {
    const statusCode = (error as FastifyError).statusCode!;
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: (error as FastifyError).code || 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }

  // Fallback for unexpected errors
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    }
  });
}
