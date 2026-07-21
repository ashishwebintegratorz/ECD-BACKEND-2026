import { HTTPSTATUS } from "../config/http.config.js";

export class AppError extends Error {
  public statusCode: number;
  public errorCode?: string;

  constructor(
    message: string,
    statusCode = HTTPSTATUS.INTERNAL_SERVER_ERROR,
    errorCode?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestException extends AppError {
  constructor(message = "Bad Request") {
    super(message, HTTPSTATUS.BAD_REQUEST);
  }
}

export class NotFoundException extends AppError {
  constructor(message = "Not Found") {
    super(message, HTTPSTATUS.NOT_FOUND);
  }
}

export class UnauthorizedException extends AppError {
  constructor(message = "Unauthorized") {
    super(message, HTTPSTATUS.UNAUTHORIZED);
  }
}

export class ForbiddenException extends AppError {
  constructor(message = "Forbidden") {
    super(message, HTTPSTATUS.FORBIDDEN);
  }
}

export class InternalServerException extends AppError {
  constructor(message = "Internal Server Error") {
    super(message, HTTPSTATUS.INTERNAL_SERVER_ERROR);
  }
}

export class TooManyRequestsException extends AppError {
  constructor(message = "Too Many Requests") {
    super(message, HTTPSTATUS.TOO_MANY_REQUESTS);
  }
}

