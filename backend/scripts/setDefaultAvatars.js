import { pool } from "../utils/db.js";

const DEFAULT_AVATAR =
  "https://nybmykdjtkjaatepkfog.supabase.co/storage/v1/object/public/image/users/default-avatar-icon-of-social-media-user-vector.jpg";

const { rowCount } = await pool.query(
  `
  UPDATE public.users
  SET profile_picture = $1
  WHERE profile_picture IS NULL
     OR TRIM(profile_picture) = ''
  `,
  [DEFAULT_AVATAR],
);

console.log(`Updated ${rowCount ?? 0} users with default avatar`);
await pool.end();
