/**
 * Custom error class for the application
 * This lets us throw errors that carry an intended HTTP status code, instead of manually
 * setting the status code in the response.
 */

export class AppError extends Error {
  statusCode: number;
  status: string;
  reason?: string; // optional, finer-grained than 'status', for cases like token-expired vs invalid-token

  constructor(
    message: string,
    statusCode: number,
    status: string,
    reason?: string,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.status = status;
    this.reason = reason;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
