import { apiUrl } from "@/lib/apiBase";

const TOKEN_STORAGE_KEY = "tft_token";

const resolveAuthToken = (token?: string | null) => {
  if (typeof token === "string" && token.trim()) {
    return token.trim();
  }

  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

const parseUploadResponse = async (response: Response) => {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: string }).error)
        : null) || "Upload failed";
    throw new Error(message);
  }

  const url =
    payload && typeof payload === "object" && "url" in payload
      ? String((payload as { url?: string }).url ?? "")
      : "";

  if (!url) {
    throw new Error("Upload response missing image url");
  }

  return url;
};

export const uploadImageToSupabase = async (
  file: File,
  token?: string | null,
) => {
  const formData = new FormData();
  formData.append("file", file);

  const authToken = resolveAuthToken(token);
  const headers: HeadersInit = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(apiUrl("/api/uploads/image"), {
    method: "POST",
    headers,
    body: formData,
  });

  return parseUploadResponse(response);
};

export const deleteImageFromSupabase = async (
  publicUrl: string,
  token?: string | null,
) => {
  if (!publicUrl.trim()) return false;

  const authToken = resolveAuthToken(token);
  if (!authToken) {
    throw new Error("Unauthorized");
  }

  const response = await fetch(apiUrl("/api/uploads/image"), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: publicUrl }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: string }).error)
        : null) || "Delete failed";
    throw new Error(message);
  }

  return true;
};
