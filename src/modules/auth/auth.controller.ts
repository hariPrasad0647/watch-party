import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service.js';
import { env } from '../../config/env.js';
import { AuthInvalidTokenError } from '../../common/errors/index.js';

export class AuthController {
  static async register(request: FastifyRequest, reply: FastifyReply) {
    const input = request.body as any;
    const result = await AuthService.register(input);

    this.setRefreshCookie(reply, result.refreshToken);

    return reply.send({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken
      }
    });
  }

  static async login(request: FastifyRequest, reply: FastifyReply) {
    const input = request.body as any;
    const result = await AuthService.login(input);

    this.setRefreshCookie(reply, result.refreshToken);

    return reply.send({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken
      }
    });
  }

  static async refresh(request: FastifyRequest, reply: FastifyReply) {
    const refreshToken = request.cookies[env.AUTH_REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      throw new AuthInvalidTokenError('Refresh token missing');
    }

    const result = await AuthService.refresh(refreshToken);

    this.setRefreshCookie(reply, result.refreshToken);

    return reply.send({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken
      }
    });
  }

  static async logout(request: FastifyRequest, reply: FastifyReply) {
    const refreshToken = request.cookies[env.AUTH_REFRESH_COOKIE_NAME];

    if (refreshToken) {
      await AuthService.logout(refreshToken);
    }

    this.clearRefreshCookie(reply);

    return reply.send({
      success: true,
      data: null
    });
  }

  static async me(request: FastifyRequest, reply: FastifyReply) {
    // request.user is set by the requireAuth middleware
    return reply.send({
      success: true,
      data: {
        user: request.user
      }
    });
  }

  private static setRefreshCookie(reply: FastifyReply, token: string) {
    reply.setCookie(env.AUTH_REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.AUTH_REFRESH_COOKIE_SECURE,
      sameSite: env.AUTH_REFRESH_COOKIE_SAME_SITE as any,
      domain: env.AUTH_REFRESH_COOKIE_DOMAIN,
      path: '/api/v1/auth', // Scoped to auth endpoints to minimize exposure
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });
  }

  private static clearRefreshCookie(reply: FastifyReply) {
    reply.clearCookie(env.AUTH_REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: env.AUTH_REFRESH_COOKIE_SECURE,
      sameSite: env.AUTH_REFRESH_COOKIE_SAME_SITE as any,
      domain: env.AUTH_REFRESH_COOKIE_DOMAIN,
      path: '/api/v1/auth'
    });
  }
}
