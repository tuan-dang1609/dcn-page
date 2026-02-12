// backend/utils/db.js
import "dotenv/config";
import { SQL } from "bun";

const connectionString = process.env.DATABASE_URL;

export const sql = new SQL(connectionString);

// compatibility wrapper used in original code (optional)
export const pool = {
  query: async (text, params = []) => {
    if (params && params.length) {
      // Use unsafe when you pass raw SQL + params (simpler here)
      const res = await sql.unsafe(text, params);
      return { rows: res.rows ?? res };
    } else {
      const res = await sql.unsafe(text);
      return { rows: res.rows ?? res };
    }
  },
  close: async () => await sql.close(),
};
export async function testConnection() {
  const rows = await sql`SELECT 1`;
  return rows;
}
