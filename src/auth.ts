import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "./db";
import { AppError } from "./error-schema";
import { asyncHandler } from "./asyncHandler";
import { validate } from "./validate";
import { signupSchema, loginSchema } from "./form-schemas";
import { authLimiter } from "./ratelimit";
import { env } from "./env";

const router = Router();

export function GenerateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

// ---------------------------------------------------------------------------------- Signup route
router.post(
  "/signup",
  authLimiter,
  validate(signupSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new AppError(
        "Email and password are required",
        400,
        "INVALID_ARGUMENT",
      );
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existing.rows.length > 0) {
      throw new AppError("User already exists", 409, "ALREADY_EXISTS");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash],
    );
    // Return the created user
    res.status(201).json(result.rows[0]);
  }),
);

// ---------------------------------------------------------------------------------- Login route
router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new AppError(
        "Email and password are required",
        400,
        "INVALID_ARGUMENT",
      );
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];
    if (!user) {
      throw new AppError("Invalid credentials", 401, "UNAUTHENTICATED");
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError("Invalid credentials", 401, "UNAUTHENTICATED");
    }

    const accessToken = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const refreshToken = GenerateRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Inserts refresh token into the database
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.id, refreshToken, expiresAt],
    );

    res.cookie("accessToken", accessToken, {
      httpOnly: true, // prevents XSS attacks
      // secure: true,    // HTTPS only
      secure: env.NODE_ENV === "production", // in production, use secure: true (in dev it is false, beacause localhost is HTTP, not HTTPS)
      sameSite: env.NODE_ENV === "production" ? "none" : "strict", // SameSite=None is required for cross-site frontend/API cookies; Origin is checked separately.
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      // secure: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({ message: "logged in" }); // no tokens in the body anymore!
  }),
);

// ---------------------------------------------------------------------------------- Refresh Token route
// Rotate the refresh token atomically. FOR UPDATE serializes concurrent uses of the same token.
router.post(
  "/refresh",
  asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      throw new AppError("Refresh token is required", 400, "INVALID_ARGUMENT");
    }

    const client = await pool.connect();
    let userId: number;
    try {
      await client.query("BEGIN");

      const result = await client.query(
        "SELECT id, user_id, expires_at FROM refresh_tokens WHERE token = $1 FOR UPDATE",
        [refreshToken],
      );
      const stored = result.rows[0];

      if (!stored) {
        await client.query("ROLLBACK");
        throw new AppError("Invalid refresh token", 401, "UNAUTHENTICATED");
      }

      if (new Date(stored.expires_at) < new Date()) {
        await client.query("DELETE FROM refresh_tokens WHERE id = $1", [stored.id]);
        await client.query("COMMIT");
        throw new AppError("Refresh token expired", 401, "EXPIRED_TOKEN");
      }

      userId = stored.user_id;
      const newRefreshToken = GenerateRefreshToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await client.query("DELETE FROM refresh_tokens WHERE id = $1", [stored.id]);
      await client.query(
        "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
        [userId, newRefreshToken, expiresAt],
      );
      await client.query("COMMIT");

      const newAccessToken = jwt.sign({ userId }, env.JWT_SECRET, {
        expiresIn: "15m",
      });

      const cookieOptions = {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: env.NODE_ENV === "production" ? "none" as const : "strict" as const,
      };
      res.cookie("accessToken", newAccessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refreshToken", newRefreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.status(200).json({ message: "tokens refreshed" });
    } catch (error) {
      // A missing/expired token has already been rolled back/committed above.
      // Roll back only if the transaction is still open.
      try {
        await client.query("ROLLBACK");
      } catch {
        // The transaction may already be closed.
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------------- Logout route
router.post(
  "/logout",
  asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;
    await pool.query("DELETE FROM refresh_tokens WHERE token = $1", [
      refreshToken,
    ]);
    const clearCookieOptions = {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" as const : "strict" as const,
    };
    res.clearCookie("accessToken", clearCookieOptions);
    res.clearCookie("refreshToken", clearCookieOptions);
    res.status(204).send();
  }),
);

export default router;
