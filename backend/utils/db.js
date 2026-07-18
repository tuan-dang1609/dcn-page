// backend/utils/db.js
// Use node-postgres (pg) instead of Bun.SQL — more reliable with Supabase
// PgBouncer / connection poolers (avoids "bind message has N result formats
// but query has M columns" protocol desync).
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const rawConnectionString = String(process.env.DATABASE_URL ?? "")
  .trim()
  .replace(/^['"]|['"]$/g, "");

if (!rawConnectionString) {
  console.warn("[db] DATABASE_URL is not set");
}

/**
 * pg v8 treats sslmode=require|prefer|verify-ca as verify-full and logs a
 * deprecation warning. Strip those modes — SSL is set explicitly on the Pool.
 */
const normalizeConnectionString = (url) => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const mode = String(parsed.searchParams.get("sslmode") ?? "").toLowerCase();
    if (["require", "prefer", "verify-ca"].includes(mode)) {
      parsed.searchParams.delete("sslmode");
    }
    return parsed.toString();
  } catch {
    return url.replace(
      /([?&])sslmode=(require|prefer|verify-ca)\b/gi,
      "$1",
    );
  }
};

const connectionString = normalizeConnectionString(rawConnectionString);

const shouldUseSsl =
  /supabase\.co|neon\.tech|sslmode=|ssl=true/i.test(rawConnectionString) ||
  process.env.DB_SSL === "true";

const poolInstance = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 30_000,
  // Transaction-mode poolers (Supabase :6543) dislike prepared statements.
  // pg's default Query avoids named prepared statements for one-shot queries.
  ...(shouldUseSsl
    ? {
        ssl: {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true",
        },
      }
    : {}),
});

poolInstance.on("error", (err) => {
  console.error("[db] unexpected idle client error:", err?.message ?? err);
});

const isTransientDbError = (err) => {
  const message = String(err?.message ?? err ?? "").toLowerCase();
  const code = String(err?.code ?? "");
  return (
    message.includes("connection closed") ||
    message.includes("connection terminated") ||
    message.includes("connection reset") ||
    message.includes("not connected") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("cached plan must not change result type") ||
    message.includes("bind message has") ||
    message.includes("result formats") ||
    code === "08P01" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03"
  );
};

const queryWithRetry = async (text, params = [], attempt = 0) => {
  try {
    return await poolInstance.query(text, params);
  } catch (err) {
    if (!isTransientDbError(err) || attempt >= 2) throw err;
    // Brief pause then retry — pool will hand a fresh client.
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    return queryWithRetry(text, params, attempt + 1);
  }
};

/** Compatibility export — some scripts may import { sql }. Prefer pool.query. */
export const sql = {
  unsafe: async (text, params = []) => {
    const res = await queryWithRetry(text, params);
    return res.rows;
  },
};

export const pool = {
  query: async (text, params = []) => queryWithRetry(text, params),
  transaction: async (callback) => {
    const client = await poolInstance.connect();
    try {
      await client.query("BEGIN");
      const tx = {
        query: async (text, params = []) => client.query(text, params),
      };
      const result = await callback(tx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback errors
      }
      throw err;
    } finally {
      client.release();
    }
  },
  close: async () => {
    await poolInstance.end();
  },
};

export async function testConnection() {
  const { rows } = await pool.query("SELECT 1 AS ok");
  return rows;
}
