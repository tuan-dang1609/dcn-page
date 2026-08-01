-- Gán avatar mặc định cho user chưa có ảnh hồ sơ.
-- Chạy trên Postgres (Supabase SQL editor hoặc psql).

UPDATE public.users
SET profile_picture = 'https://nybmykdjtkjaatepkfog.supabase.co/storage/v1/object/public/image/users/default-avatar-icon-of-social-media-user-vector.jpg'
WHERE profile_picture IS NULL
   OR TRIM(profile_picture) = '';
