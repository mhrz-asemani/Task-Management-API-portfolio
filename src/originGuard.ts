import { Request, Response, NextFunction } from "express";
import { AppError } from "./error-schema";
import { env } from "./env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const allowedOrigin = new URL(env.FRONTEND_ORIGIN).origin;

/**
 * Defense in depth against CSRF for browser requests.
 * Browsers include Origin on state-changing cross-origin requests; Referer is a fallback.
 * Requests from non-browser clients that send neither header remain supported.
 */
export function originGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const origin = req.get("origin");
  const referer = req.get("referer");
  const candidate = origin ?? referer;

  if (!candidate) {
    next();
    return;
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(candidate).origin;
  } catch {
    next(new AppError("Invalid request origin", 403, "FORBIDDEN"));
    return;
  }

  if (requestOrigin !== allowedOrigin) {
    next(new AppError("Request origin is not allowed", 403, "FORBIDDEN"));
    return;
  }

  next();
}
