/**
 * Điền riot_puuid_val / riot_puuid_lol cho user đã liên kết Riot trước khi có cột puuid.
 * Tra theo riot_account (gameName#tagLine) bằng từng key → chỉ đúng với người CHƯA đổi tên Riot;
 * người đã đổi tên sẽ không tìm thấy và để trống (liên kết lại là có).
 *
 *   bun scripts/backfill-riot-puuid.js            # chạy thử: in kết quả, không ghi DB
 *   bun scripts/backfill-riot-puuid.js --apply    # ghi vào DB
 */
import { pool } from "../utils/db.js";
import {
  RIOT_PUUID_APPS,
  ensureRiotPuuidColumns,
  lookupPuuidByRiotId,
} from "../utils/riotPuuid.js";

const APPLY = process.argv.includes("--apply");
// Key dev: 20 lượt/giây, 100 lượt/2 phút → mỗi lượt cách ~1,3 giây cho an toàn
const DELAY_MS = 1300;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const splitRiotId = (value) => {
  const [gameName, ...rest] = String(value ?? "").split("#");
  const tagLine = rest.join("#").trim();
  return gameName?.trim() && tagLine ? { gameName: gameName.trim(), tagLine } : null;
};

const main = async () => {
  // Chạy thử không đụng DB (kể cả tạo cột); --apply mới tạo cột nếu thiếu
  if (APPLY) await ensureRiotPuuidColumns();
  const { rows: existingCols } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'",
  );
  const hasColumn = new Set(existingCols.map((row) => row.column_name));

  const apps = Object.entries(RIOT_PUUID_APPS).filter(([, app]) => app.apiKey());
  if (!apps.length) {
    console.error("Không có key Riot nào (API_KEY_VALORANT_RIOT / LOL_RIOT_API_KEY).");
    process.exit(1);
  }
  console.log(`Ứng dụng có key: ${apps.map(([name]) => name).join(", ")}${APPLY ? "" : " — CHẠY THỬ, không ghi DB"}`);

  const colOrNull = (column) => (hasColumn.has(column) ? column : `NULL AS ${column}`);
  const missing = apps
    .map(([, app]) => (hasColumn.has(app.column) ? `${app.column} IS NULL` : "TRUE"))
    .join(" OR ");
  const { rows } = await pool.query(
    `
    SELECT id, riot_account, ${colOrNull("riot_puuid_val")}, ${colOrNull("riot_puuid_lol")}
    FROM users
    WHERE riot_account IS NOT NULL AND TRIM(riot_account) <> '' AND (${missing})
    ORDER BY id
    `,
  );
  console.log(`${rows.length} user cần điền puuid.`);

  const stats = { found: 0, notFound: 0, conflict: 0 };

  for (const user of rows) {
    const riotId = splitRiotId(user.riot_account);
    if (!riotId) {
      console.log(`  #${user.id} ${user.riot_account}: Riot ID không hợp lệ, bỏ qua`);
      continue;
    }

    for (const [name, app] of apps) {
      if (user[app.column]) continue;
      const puuid = await lookupPuuidByRiotId(name, riotId.gameName, riotId.tagLine);
      await sleep(DELAY_MS);

      if (!puuid) {
        stats.notFound += 1;
        console.log(`  #${user.id} ${user.riot_account} [${name}]: không tìm thấy (có thể đã đổi tên)`);
        continue;
      }

      if (!APPLY) {
        stats.found += 1;
        console.log(`  #${user.id} ${user.riot_account} [${name}]: ${puuid.slice(0, 12)}…`);
        continue;
      }

      try {
        await pool.query(`UPDATE users SET ${app.column} = $1 WHERE id = $2 AND ${app.column} IS NULL`, [
          puuid,
          user.id,
        ]);
        stats.found += 1;
        console.log(`  #${user.id} ${user.riot_account} [${name}]: đã lưu`);
      } catch (error) {
        // Trùng unique: user khác đã giữ puuid này (2 tài khoản cùng 1 Riot ID)
        stats.conflict += 1;
        console.log(`  #${user.id} ${user.riot_account} [${name}]: trùng với user khác — ${error.message}`);
      }
    }
  }

  console.log(
    `Xong: ${stats.found} tìm thấy${APPLY ? " và đã lưu" : ""}, ${stats.notFound} không tìm thấy, ${stats.conflict} trùng.`,
  );
  await pool.end();
};

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
