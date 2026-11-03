/**
 * This middleware has a special signature, 4 parameters — Express specifically recognizes any middleware with 4 args as an error handler, and routes errors to it automatically.
 */
import { Request, Response, NextFunction } from "express";
import { AppError } from "./error-schema";
import { logger } from "./logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof AppError) {
    logger.warn({ err, path: req.path, method: req.method }, err.message);

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.statusCode,
        message: err.message,
        status: err.status,
        ...(err.reason && { reason: err.reason }),
      },
    });
  }

  logger.error({ err, path: req.path, method: req.method }, "Unexpected error");

  // unexpected error, never leak internal details to the client
  res.status(500).json({
    success: false,
    error: { code: 500, message: "Something went wrong", status: "INTERNAL" },
  });
}
