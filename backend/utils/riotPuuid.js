import { pool } from "./db.js";

/**
 * puuid Riot bị mã hoá theo từng ứng dụng (API key): cùng 1 người, key Valorant và key LMHT
 * trả 2 puuid khác nhau → lưu riêng từng cột, dùng để ghép người chơi trong dữ liệu trận
 * (puuid không đổi khi người chơi đổi tên Riot).
 */
export const RIOT_PUUID_APPS = {
  val: {
    column: "riot_puuid_val",
    apiKey: () =>
      String(process.env.API_KEY_VALORANT_RIOT ?? process.env.RIOT_API_KEY ?? "").trim(),
  },
  lol: {
    column: "riot_puuid_lol",
    apiKey: () => String(process.env.LOL_RIOT_API_KEY ?? "").trim(),
  },
};

// account-v1 là API theo cụm: americas / asia / europe đều trả cùng 1 tài khoản
const ACCOUNT_API_BASE = "https://asia.api.riotgames.com";

let ensureColumnsPromise = null;

/** Tạo cột nếu DB chưa có (IF NOT EXISTS — chạy lại nhiều lần không sao). */
export const ensureRiotPuuidColumns = () => {
  if (!ensureColumnsPromise) {
    ensureColumnsPromise = (async () => {
      for (const { column } of Object.values(RIOT_PUUID_APPS)) {
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column} TEXT`);
        await pool.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS users_${column}_key ON users (${column}) WHERE ${column} IS NOT NULL`,
        );
      }
    })().catch((error) => {
      ensureColumnsPromise = null;
      throw error;
    });
  }
  return ensureColumnsPromise;
};

/** puuid của 1 Riot ID theo key của ứng dụng (val / lol). Không tìm thấy hoặc lỗi → null. */
export const lookupPuuidByRiotId = async (app, gameName, tagLine) => {
  const apiKey = RIOT_PUUID_APPS[app]?.apiKey();
  if (!apiKey || !gameName || !tagLine) return null;

  try {
    const response = await fetch(
      `${ACCOUNT_API_BASE}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { "X-Riot-Token": apiKey, Accept: "application/json" } },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return String(payload?.puuid ?? "").trim() || null;
  } catch {
    return null;
  }
};

/** puuid cho cả 2 ứng dụng — gọi ngay lúc liên kết Riot, khi tên vừa được Riot xác nhận là đúng. */
export const resolveRiotPuuids = async (gameName, tagLine) => {
  const [val, lol] = await Promise.all([
    lookupPuuidByRiotId("val", gameName, tagLine),
    lookupPuuidByRiotId("lol", gameName, tagLine),
  ]);
  return { val, lol };
};
