import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./error-schema";
import { env } from "./env";

export interface AuthRequest extends Request {
  userId?: number;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies.accessToken;
  if (!token) {
    return next(
      new AppError("Missing token", 401, "UNAUTHENTICATED", "MISSING_TOKEN"),
    );
  }

  try {
    // jwt.verify(token, process.env.JWT_SECRET as string) verifies the JWT token using the secret key from the environment variable.
    // If the token is valid, it decodes the token payload, which should include the userId.
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      userId: number;
    };
    // req.userId = decoded.userId; attaches the userId from the decoded token to the request object,
    // which makes the authenticated user's ID available to downstream handlers.
    req.userId = decoded.userId;
    // next(); calls the next middleware in the stack, allowing the authenticated request to proceed.
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(
        new AppError("Token expired", 401, "UNAUTHENTICATED", "EXPIRED_TOKEN"),
      );
    }
    next(
      new AppError("Invalid token", 401, "UNAUTHENTICATED", "INVALID_TOKEN"),
    );
  }
}

/**
 * Since requireAuth is'nt wrapped by asyncHandler (it's synchronous), we can't just throw,
 * Express v4 won't catch it and pass it to the error handler. So it's safe to use return next(err)
 */
