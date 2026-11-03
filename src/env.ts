// a schema for .env key/values, to ensure they are valid and have the correct type

import dotenv from "dotenv";
import { z } from "zod";

// Load the right .env file BEFORE validating, based on NODE_ENV
const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
dotenv.config({ path: envFile });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // PostgreSQL is expected to run in Docker and publish port 5432 to the host.
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  // Enable only when the hosted PostgreSQL provider requires TLS.
  DB_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),

  FRONTEND_ORIGIN: z.string().default("http://localhost:58585"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(
    parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n"),
  );
  process.exit(1); // stop the app immediately, don't let it start in a broken state
}

export const env = parsed.data;
