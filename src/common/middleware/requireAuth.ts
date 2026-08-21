import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError } from '../errors/index.js';
import { TokenService } from '../../modules/auth/token.service.js';

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid authorization header');
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    throw new AuthenticationError('Token is missing');
  }

  try {
    const payload = TokenService.verifyAccessToken(token);
    request.user = { id: payload.sub };
  } catch (error) {
    // Re-throw to be caught by global errorHandler
    throw error;
  }
}
