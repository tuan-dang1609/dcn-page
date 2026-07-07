const SUPABASE_URL = String(process.env.SUPABASE_URL ?? "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    "",
).trim();
const SUPABASE_BUCKET = String(process.env.SUPABASE_BUCKET ?? "image").trim();

const resolveProjectBaseUrl = (rawUrl) => {
  const trimmed = rawUrl.trim().replace(/\/+$/, "");

  if (
    trimmed.includes(".supabase.co") &&
    !trimmed.includes(".storage.supabase.co")
  ) {
    return trimmed;
  }

  const s3Match = trimmed.match(
    /^https:\/\/([a-z0-9-]+)\.storage\.supabase\.co/i,
  );
  if (s3Match?.[1]) {
    return `https://${s3Match[1]}.supabase.co`;
  }

  return trimmed;
};

const getSupabaseConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase server config. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return {
    projectBaseUrl: resolveProjectBaseUrl(SUPABASE_URL),
    bucket: SUPABASE_BUCKET,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  };
};

const buildStoragePath = (fileName, userId = null) => {
  const safeName = String(fileName || "image.png").replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );
  const prefix = userId ? `users/${userId}` : "users/signup";
  return `${prefix}-${Date.now()}-${safeName}`;
};

const parseSupabasePublicObject = (publicUrl) => {
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

export const uploadImageBuffer = async ({
  buffer,
  fileName,
  contentType,
  userId = null,
}) => {
  const { projectBaseUrl, bucket, serviceRoleKey } = getSupabaseConfig();
  const objectPath = buildStoragePath(fileName, userId);
  const uploadUrl = `${projectBaseUrl}/storage/v1/object/${bucket}/${objectPath}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: buffer,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(text || "Failed to upload image to Supabase");
  }

  return `${projectBaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
};

export const deleteImageByPublicUrl = async (publicUrl) => {
  if (!String(publicUrl ?? "").trim()) return false;

  const { projectBaseUrl, bucket, serviceRoleKey } = getSupabaseConfig();
  const parsed = parseSupabasePublicObject(publicUrl);
  if (!parsed) return false;

  if (parsed.projectBaseUrl !== projectBaseUrl) return false;
  if (parsed.bucket !== bucket) return false;

  const encodedObjectPath = parsed.objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const deleteUrl = `${projectBaseUrl}/storage/v1/object/${parsed.bucket}/${encodedObjectPath}`;

  const deleteResponse = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
  });

  if (!deleteResponse.ok) {
    const text = await deleteResponse.text();
    throw new Error(text || "Failed to delete image from Supabase");
  }

  return true;
};
