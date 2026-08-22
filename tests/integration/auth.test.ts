import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';

// Mock the entire AuthRepository
vi.mock('../../src/modules/auth/auth.repository.js', () => {
  return {
    AuthRepository: {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      createUser: vi.fn(),
      createRefreshSession: vi.fn(),
      findActiveSessionByJti: vi.fn(),
      revokeSession: vi.fn(),
      revokeAllUserSessions: vi.fn(),
      getPrisma: vi.fn(() => ({
        $transaction: async (cb: any) =>
          cb({
            user: {
              create: vi.fn().mockResolvedValue({ id: 'user-id-123', email: 'test@test.com' })
            },
            refreshSession: {
              create: vi.fn(),
              findUnique: vi.fn(),
              update: vi.fn(),
              updateMany: vi.fn()
            }
          })
      }))
    }
  };
});

describe('Authentication Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should register a new user successfully', async () => {
    // Setup mock
    (AuthRepository.findUserByEmail as any).mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'securepassword123'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();

    // Check if cookie was set
    const cookies = response.cookies;
    const refreshCookie = cookies.find((c) => c.name === 'wp_refresh_token');
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
  });

  it('should prevent duplicate registration', async () => {
    (AuthRepository.findUserByEmail as any).mockResolvedValue({ id: 'existing-id' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'securepassword123'
      }
    });

    expect(response.statusCode).toBe(409);
  });

  it('should reject login for inactive user with generic error', async () => {
    const argon2 = await import('argon2');
    const hash = await argon2.hash('securepassword123');

    (AuthRepository.findUserByEmail as any).mockResolvedValue({
      id: 'inactive-id',
      email: 'inactive@example.com',
      passwordHash: hash,
      isActive: false
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'inactive@example.com',
        password: 'securepassword123'
      }
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('should reject refresh for inactive user', async () => {
    // Generate valid mock refresh token
    const TokenService = (await import('../../src/modules/auth/token.service.js')).TokenService;
    const jti = 'refresh-jti-123';
    const rawRefresh = TokenService.generateRefreshToken('inactive-id', jti);
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(rawRefresh).digest('hex');

    (AuthRepository.getPrisma as any).mockReturnValue({
      $transaction: async (cb: any) =>
        cb({
          refreshSession: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'session-id',
              userId: 'inactive-id',
              jti,
              tokenHash,
              revokedAt: null,
              user: { isActive: false }
            }),
            updateMany: vi.fn()
          }
        })
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: {
        wp_refresh_token: rawRefresh
      }
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('AUTH_INVALID_TOKEN');
  });
});
