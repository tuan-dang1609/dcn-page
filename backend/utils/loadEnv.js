import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load env from backend/.env and repo-root .env (cwd-independent). */
const envCandidates = [
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
];

for (const envPath of envCandidates) {
  if (!fs.existsSync(envPath)) continue;
  dotenv.config({ path: envPath });
}
