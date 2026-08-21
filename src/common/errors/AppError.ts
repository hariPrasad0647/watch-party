export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class AuthInvalidCredentialsError extends AppError {
  constructor(message: string = 'Invalid email or password') {
    super(message, 401, 'AUTH_INVALID_CREDENTIALS');
  }
}

export class AuthTokenExpiredError extends AppError {
  constructor(message: string = 'Token expired') {
    super(message, 401, 'AUTH_TOKEN_EXPIRED');
  }
}

export class AuthInvalidTokenError extends AppError {
  constructor(message: string = 'Invalid token') {
    super(message, 401, 'AUTH_INVALID_TOKEN');
  }
}

export class AuthSessionRevokedError extends AppError {
  constructor(message: string = 'Session has been revoked') {
    super(message, 401, 'AUTH_SESSION_REVOKED');
  }
}

export class AuthAccountInactiveError extends AppError {
  constructor(message: string = 'Account is inactive') {
    super(message, 403, 'AUTH_ACCOUNT_INACTIVE');
  }
}

export class AuthEmailAlreadyExistsError extends AppError {
  constructor(message: string = 'Email is already registered') {
    super(message, 409, 'AUTH_EMAIL_ALREADY_EXISTS');
  }
}
