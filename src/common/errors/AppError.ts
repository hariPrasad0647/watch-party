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

export class RoomNotFoundError extends AppError {
  constructor(message: string = 'Room not found') {
    super(message, 404, 'ROOM_NOT_FOUND');
  }
}

export class RoomForbiddenError extends AppError {
  constructor(message: string = 'Not authorized to access this room') {
    super(message, 403, 'ROOM_FORBIDDEN');
  }
}

export class RoomAlreadyEndedError extends AppError {
  constructor(message: string = 'Room is already ended') {
    super(message, 400, 'ROOM_ALREADY_ENDED');
  }
}

export class RoomInvalidStateError extends AppError {
  constructor(message: string = 'Invalid room state transition') {
    super(message, 400, 'ROOM_INVALID_STATE');
  }
}

export class ParticipantNotFoundError extends AppError {
  constructor(message: string = 'Participant not found in this room') {
    super(message, 404, 'PARTICIPANT_NOT_FOUND');
  }
}

export class InvitationInvalidError extends AppError {
  constructor(message = 'Invalid invitation') {
    super(message, 400, 'INVITATION_INVALID');
  }
}

export class InvitationExpiredError extends AppError {
  constructor(message = 'Invitation has expired') {
    super(message, 400, 'INVITATION_EXPIRED');
  }
}

export class InvitationRevokedError extends AppError {
  constructor(message = 'Invitation has been revoked') {
    super(message, 400, 'INVITATION_REVOKED');
  }
}

export class InvitationExhaustedError extends AppError {
  constructor(message = 'Invitation has reached maximum uses') {
    super(message, 400, 'INVITATION_EXHAUSTED');
  }
}

export class InvitationForbiddenError extends AppError {
  constructor(message = 'Invitations can only be created for private rooms') {
    super(message, 403, 'INVITATION_FORBIDDEN');
  }
}
