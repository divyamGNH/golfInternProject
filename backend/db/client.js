import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error(
    "Missing Postgres connection string. Set POSTGRES_URL, DATABASE_URL, or SUPABASE_DB_URL.",
  );
}

const shouldUseSsl =
  process.env.PGSSLMODE !== "disable" &&
  (connectionString.includes("supabase.co") || process.env.PGSSLMODE === "require");

const parseEnvInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
  max: parseEnvInt(process.env.PG_POOL_MAX, 10),
  min: parseEnvInt(process.env.PG_POOL_MIN, 0),
  idleTimeoutMillis: parseEnvInt(process.env.PG_IDLE_TIMEOUT_MS, 30000),
  connectionTimeoutMillis: parseEnvInt(process.env.PG_CONNECT_TIMEOUT_MS, 10000),
  keepAlive: true,
  keepAliveInitialDelayMillis: parseEnvInt(
    process.env.PG_KEEPALIVE_INITIAL_DELAY_MS,
    10000,
  ),
});

// Idle client disconnects can happen with managed poolers; keep process alive and let pg reconnect.
pool.on("error", (error) => {
  console.error("Postgres pool idle client error:", error.message);
});

export const query = (text, params = []) => pool.query(text, params);

export const withTransaction = async (handler) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export default pool;
