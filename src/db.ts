import { Pool } from "pg";
import { env } from "./env";
import { logger } from "./logger";

export const pool = new Pool({
  user: env.DB_USER,
  host: env.DB_HOST,
  database: env.DB_NAME,
  password: env.DB_PASSWORD,
  port: env.DB_PORT,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 20, // max simultaneous connections in the pool
  idleTimeoutMillis: 30000, // close idle clients after 30s
  connectionTimeoutMillis: 5000, // fail fast if can't connect within 5s
});

// Without this, an idle client error (e.g. Postgres restarting) can crash the whole process
pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle database client");
});
