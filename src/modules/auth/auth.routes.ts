import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';
import { requireAuth } from '../../common/middleware/requireAuth.js';
import { registerSchema, loginSchema } from './auth.schema.js';

export async function authRoutes(app: FastifyInstance) {
  // Rate limiting for auth endpoints (tighter than global)
  const authRateLimit = {
    max: 10,
    timeWindow: '1 minute'
  };

  app.post('/register', { config: { rateLimit: authRateLimit } }, async (request, reply) => {
    // Validate body
    request.body = registerSchema.parse(request.body);
    return AuthController.register(request, reply);
  });

  app.post('/login', { config: { rateLimit: authRateLimit } }, async (request, reply) => {
    // Validate body
    request.body = loginSchema.parse(request.body);
    return AuthController.login(request, reply);
  });

  app.post('/refresh', { config: { rateLimit: authRateLimit } }, async (request, reply) => {
    return AuthController.refresh(request, reply);
  });

  app.post('/logout', async (request, reply) => {
    return AuthController.logout(request, reply);
  });

  app.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    return AuthController.me(request, reply);
  });
}
