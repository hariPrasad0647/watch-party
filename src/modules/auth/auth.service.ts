import argon2 from 'argon2';
import crypto from 'crypto';
import { AuthRepository } from './auth.repository.js';
import { TokenService } from './token.service.js';
import {
  AuthInvalidCredentialsError,
  AuthEmailAlreadyExistsError,
  AuthSessionRevokedError,
  AuthInvalidTokenError
} from '../../common/errors/index.js';
import { logger } from '../../infrastructure/logger/index.js';
import { RegisterInput, LoginInput } from './auth.schema.js';

export class AuthService {
  /**
   * Register a new user
   */
  static async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();

    // Quick check before hashing (optimization, but relies on DB constraint for final race-condition safety)
    const existingUser = await AuthRepository.findUserByEmail(email);
    if (existingUser) {
      throw new AuthEmailAlreadyExistsError();
    }

    const passwordHash = await argon2.hash(input.password);

    try {
      // Prisma transaction to create user and initial session atomically
      return await AuthRepository.getPrisma().$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash
          }
        });

        return this.createSessionAndTokens(tx, user.id);
      });
    } catch (error: any) {
      // Prisma unique constraint violation code
      if (error.code === 'P2002') {
        throw new AuthEmailAlreadyExistsError();
      }
      throw error;
    }
  }

  /**
   * Login an existing user
   */
  static async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();
    const user = await AuthRepository.findUserByEmail(email);

    if (!user) {
      throw new AuthInvalidCredentialsError();
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, input.password);
    if (!isPasswordValid) {
      throw new AuthInvalidCredentialsError();
    }

    if (!user.isActive) {
      // User requested generic failure for login of inactive account
      throw new AuthInvalidCredentialsError();
    }

    return await AuthRepository.getPrisma().$transaction(async (tx) => {
      return this.createSessionAndTokens(tx, user.id);
    });
  }

  /**
   * Refresh token rotation
   */
  static async refresh(rawRefreshToken: string) {
    // 1. Verify JWT signature and expiration
    const payload = TokenService.verifyRefreshToken(rawRefreshToken);

    // 2. Compute hash of the raw token for DB comparison
    const tokenHash = this.hashToken(rawRefreshToken);

    return await AuthRepository.getPrisma().$transaction(async (tx) => {
      // 3. Find the session using the unique jti
      const session = await tx.refreshSession.findUnique({
        where: { jti: payload.jti },
        include: { user: true }
      });

      if (!session) {
        throw new AuthInvalidTokenError('Session not found');
      }

      // 4. Verify token match
      if (session.tokenHash !== tokenHash) {
        throw new AuthInvalidTokenError('Invalid token footprint');
      }

      // 5. Detect reuse of a revoked token (e.g. from an old rotation step)
      if (session.revokedAt) {
        logger.warn(
          {
            userId: session.userId,
            jti: session.jti,
            replacedByJti: session.replacedByJti
          },
          'Security Event: Revoked refresh token reuse attempted'
        );

        // Revoke all active sessions for this user as a security measure
        await tx.refreshSession.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: new Date() }
        });

        throw new AuthSessionRevokedError();
      }

      // 6. Enforce Account active status for refresh
      if (!session.user.isActive) {
        logger.warn(
          { userId: session.userId },
          'Security Event: Inactive user attempted to refresh token'
        );
        // Revoke all sessions since the account is inactive
        await tx.refreshSession.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: new Date() }
        });
        throw new AuthInvalidTokenError('Account is inactive');
      }

      // 7. Perform Rotation
      const newJti = crypto.randomUUID();
      const newRawRefresh = TokenService.generateRefreshToken(session.userId, newJti);
      const newHash = this.hashToken(newRawRefresh);

      // Revoke the old session
      await tx.refreshSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          replacedByJti: newJti
        }
      });

      // Create new session
      const expiresAt = new Date(Date.now() + this.getRefreshExpiryMs());
      await AuthRepository.createRefreshSession(tx, {
        userId: session.userId,
        jti: newJti,
        tokenHash: newHash,
        expiresAt
      });

      const newAccessToken = TokenService.generateAccessToken(session.userId, crypto.randomUUID());

      return {
        user: { id: session.userId },
        accessToken: newAccessToken,
        refreshToken: newRawRefresh
      };
    });
  }

  /**
   * Logout user by revoking the specific refresh session
   */
  static async logout(rawRefreshToken: string) {
    try {
      // Verify JWT signature (if it's expired we still might want to revoke it, but it's safe to skip if signature fails)
      const payload = TokenService.verifyRefreshToken(rawRefreshToken);

      const session = await AuthRepository.findActiveSessionByJti(payload.jti);
      if (session && !session.revokedAt) {
        await AuthRepository.revokeSession(payload.jti);
      }
    } catch (error) {
      // If token is invalid or expired, we can't reliably extract jti safely to revoke.
      // We just ignore the logout error to avoid leaking state.
      logger.debug({ err: error }, 'Logout attempted with invalid/expired token');
    }
  }

  /**
   * Helper: create a session and return tokens
   */
  private static async createSessionAndTokens(tx: any, userId: string) {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();

    const accessToken = TokenService.generateAccessToken(userId, accessJti);
    const refreshToken = TokenService.generateRefreshToken(userId, refreshJti);

    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.getRefreshExpiryMs());

    await AuthRepository.createRefreshSession(tx, {
      userId,
      jti: refreshJti,
      tokenHash,
      expiresAt
    });

    return {
      user: { id: userId },
      accessToken,
      refreshToken
    };
  }

  /**
   * Helper: Hash the raw token for storage
   */
  private static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Helper: Convert JWT_REFRESH_EXPIRES_IN to milliseconds (simplified)
   */
  private static getRefreshExpiryMs(): number {
    // A production version might use a package like 'ms' to parse '30d'.
    // For simplicity, hardcoded to 30 days.
    return 30 * 24 * 60 * 60 * 1000;
  }
}
