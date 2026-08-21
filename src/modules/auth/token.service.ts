import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AuthInvalidTokenError, AuthTokenExpiredError } from '../../common/errors/index.js';

export type AccessTokenPayload = {
  sub: string; // userId
  jti: string;
  type: 'access';
};

export type RefreshTokenPayload = {
  sub: string; // userId
  jti: string;
  type: 'refresh';
};

export class TokenService {
  static generateAccessToken(userId: string, jti: string): string {
    return jwt.sign({ sub: userId, type: 'access', jti }, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as any
    });
  }

  static generateRefreshToken(userId: string, jti: string): string {
    return jwt.sign({ sub: userId, type: 'refresh', jti }, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as any
    });
  }

  static verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;
      if (payload.type !== 'access') {
        throw new AuthInvalidTokenError('Invalid token type');
      }
      return payload as AccessTokenPayload;
    } catch (error) {
      this.handleJwtError(error);
    }
  }

  static verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as any;
      if (payload.type !== 'refresh') {
        throw new AuthInvalidTokenError('Invalid token type');
      }
      return payload as RefreshTokenPayload;
    } catch (error) {
      this.handleJwtError(error);
    }
  }

  private static handleJwtError(error: any): never {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthTokenExpiredError();
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthInvalidTokenError(error.message);
    }
    if (error instanceof Error) {
      throw new AuthInvalidTokenError(error.message);
    }
    throw new AuthInvalidTokenError();
  }
}
