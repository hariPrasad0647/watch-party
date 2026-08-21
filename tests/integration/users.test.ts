import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';
import { UserRepository } from '../../src/modules/users/user.repository.js';
import { TokenService } from '../../src/modules/auth/token.service.js';

// Mock UserRepository
vi.mock('../../src/modules/users/user.repository.js', () => ({
  UserRepository: {
    findCurrentUserById: vi.fn(),
    updateProfile: vi.fn()
  }
}));

describe('Users Integration Tests', () => {
  let app: FastifyInstance;
  let validToken: string;
  const userId = 'user-123';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    
    // Generate a valid token for testing protected routes
    validToken = TokenService.generateAccessToken(userId, 'test-jti');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/users/me', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me'
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return the user profile if authenticated', async () => {
      const mockProfile = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Hari',
        avatarUrl: null,
        bio: null,
        createdAt: new Date()
      };
      
      (UserRepository.findCurrentUserById as any).mockResolvedValue(mockProfile);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: `Bearer ${validToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe('test@example.com');
      expect(body.data.user.displayName).toBe('Hari');
    });

    it('should return 404 if user no longer exists', async () => {
      (UserRepository.findCurrentUserById as any).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: `Bearer ${validToken}`
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('NOT_FOUND_ERROR');
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('should return 401 if unauthenticated', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        payload: { displayName: 'New Name' }
      });
      expect(response.statusCode).toBe(401);
    });

    it('should reject empty body', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${validToken}` },
        payload: {}
      });
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject unknown fields', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${validToken}` },
        payload: { unknownField: 'test' }
      });
      expect(response.statusCode).toBe(400);
    });

    it('should reject overly long bio', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${validToken}` },
        payload: { bio: 'a'.repeat(501) }
      });
      expect(response.statusCode).toBe(400);
    });

    it('should update valid fields successfully', async () => {
      const existingUser = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Old Name',
        avatarUrl: null,
        bio: null,
        createdAt: new Date()
      };
      (UserRepository.findCurrentUserById as any).mockResolvedValue(existingUser);
      
      const updatedUser = { ...existingUser, displayName: 'New Name' };
      (UserRepository.updateProfile as any).mockResolvedValue(updatedUser);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${validToken}` },
        payload: { displayName: 'New Name' }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.user.displayName).toBe('New Name');
      expect(UserRepository.updateProfile).toHaveBeenCalledWith(userId, { displayName: 'New Name' });
    });

    it('should handle null values correctly', async () => {
      const existingUser = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Hari',
        avatarUrl: 'https://example.com/avatar.jpg',
        bio: 'Hello world',
        createdAt: new Date()
      };
      (UserRepository.findCurrentUserById as any).mockResolvedValue(existingUser);
      
      const updatedUser = { ...existingUser, bio: null };
      (UserRepository.updateProfile as any).mockResolvedValue(updatedUser);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${validToken}` },
        payload: { bio: null }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.user.bio).toBeNull();
      expect(UserRepository.updateProfile).toHaveBeenCalledWith(userId, { bio: null });
    });
  });
});
