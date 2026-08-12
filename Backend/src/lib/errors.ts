/**
 * Typed, centralised application errors.
 *
 * The error `code` is safe to expose to clients. `details` may contain
 * internal context and must never be returned to the frontend verbatim.
 */

export interface AppErrorDetails {
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly details?: AppErrorDetails;
  public readonly statusCode: number;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    details?: AppErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    // Restore prototype chain when targeting ES5+ transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: AppErrorDetails) {
    super('NOT_FOUND', message, 404, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: AppErrorDetails) {
    super('UNAUTHORIZED', message, 401, details);
  }
}

// --- Omada ---
export class OmadaAuthenticationError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('OMADA_AUTH_ERROR', message, 502, details);
  }
}

export class OmadaApiError extends AppError {
  public readonly omadaCode?: number;
  public readonly httpStatus?: number;
  constructor(message: string, details?: AppErrorDetails, omadaCode?: number, httpStatus?: number) {
    super('OMADA_API_ERROR', message, 502, details);
    this.omadaCode = omadaCode;
    this.httpStatus = httpStatus;
  }
}

export class OmadaNetworkError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('OMADA_NETWORK_ERROR', message, 502, details);
  }
}

// --- Declared now for later milestones (not produced by this milestone) ---
export class PaymentProviderError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('PAYMENT_PROVIDER_ERROR', message, 502, details);
  }
}

export class VoucherCreationError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('VOUCHER_CREATION_ERROR', message, 502, details);
  }
}

export class SmsProviderError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('SMS_PROVIDER_ERROR', message, 502, details);
  }
}