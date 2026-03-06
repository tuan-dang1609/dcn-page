const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;
const SUPABASE_BUCKET =
  (import.meta.env.VITE_SUPABASE_BUCKET as string | undefined) || "avatars";

const buildStoragePath = (fileName: string) => {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `users/${Date.now()}-${safeName}`;
};

const resolveProjectBaseUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim().replace(/\/+$/, "");

  // Supports project URL input: https://<project-ref>.supabase.co
  if (
    trimmed.includes(".supabase.co") &&
    !trimmed.includes(".storage.supabase.co")
  ) {
    return trimmed;
  }

  // Supports S3 endpoint input:
  // https://<project-ref>.storage.supabase.co/storage/v1/s3
  const s3Match = trimmed.match(
    /^https:\/\/([a-z0-9-]+)\.storage\.supabase\.co/i,
  );
  if (s3Match?.[1]) {
    return `https://${s3Match[1]}.supabase.co`;
  }

  return trimmed;
};

const parseSupabasePublicObject = (publicUrl: string) => {
  const marker = "/storage/v1/object/public/";

  try {
    const url = new URL(publicUrl);
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) return null;

    const objectPart = url.pathname.slice(markerIndex + marker.length);
    const segments = objectPart.split("/").filter(Boolean);

    if (segments.length < 2) return null;

    const bucket = decodeURIComponent(segments[0]);
    const objectPath = segments
      .slice(1)
      .map((segment) => decodeURIComponent(segment))
      .join("/");

    return {
      projectBaseUrl: resolveProjectBaseUrl(`${url.protocol}//${url.host}`),
      bucket,
      objectPath,
    };
  } catch {
    return null;
  }
};

export const uploadImageToSupabase = async (file: File) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing Supabase config. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }

  const projectBaseUrl = resolveProjectBaseUrl(SUPABASE_URL);
  const objectPath = buildStoragePath(file.name || "avatar.png");
  const uploadUrl = `${projectBaseUrl}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    if (text.includes("row-level security policy")) {
      throw new Error(
        "Supabase Storage đang chặn upload (RLS). Hãy tạo policy INSERT cho bucket.",
      );
    }
    throw new Error(text || "Failed to upload image to Supabase");
  }

  return `${projectBaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;
};

export const deleteImageFromSupabase = async (publicUrl: string) => {
  if (!publicUrl.trim()) return false;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing Supabase config. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }

  const parsed = parseSupabasePublicObject(publicUrl);
  if (!parsed) return false;

  const projectBaseUrl = resolveProjectBaseUrl(SUPABASE_URL);

  // Safety guard: only delete from the configured project + bucket.
  if (parsed.projectBaseUrl !== projectBaseUrl) return false;
  if (parsed.bucket !== SUPABASE_BUCKET) return false;

  const encodedObjectPath = parsed.objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const deleteUrl = `${projectBaseUrl}/storage/v1/object/${parsed.bucket}/${encodedObjectPath}`;

  const deleteResponse = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!deleteResponse.ok) {
    const text = await deleteResponse.text();
    throw new Error(text || "Failed to delete image from Supabase");
  }

  return true;
};
