import { Elysia } from "elysia";
import middleware from "../utils/middleware.js";
import {
  deleteImageByPublicUrl,
  uploadImageBuffer,
} from "../utils/supabaseStorage.js";

const uploadRouter = new Elysia({ name: "Uploads" }).derive(
  middleware.deriveAuthContext,
);
const TAG = "Uploads";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const isFileLike = (value) =>
  typeof value === "object" &&
  value !== null &&
  typeof value.arrayBuffer === "function" &&
  typeof value.name === "string";

uploadRouter.post(
  "/image",
  async ({ request, user, set }) => {
    let formData;

    try {
      formData = await request.formData();
    } catch {
      set.status = 400;
      return { error: "Invalid multipart form data" };
    }

    const file = formData.get("file");
    if (!isFileLike(file)) {
      set.status = 400;
      return { error: "Missing image file" };
    }

    const contentType = String(file.type || "application/octet-stream").toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      set.status = 400;
      return { error: "Only image uploads are allowed" };
    }

    if (file.size > MAX_FILE_BYTES) {
      set.status = 400;
      return { error: "Image must be 5MB or smaller" };
    }

    try {
      const buffer = await file.arrayBuffer();
      const url = await uploadImageBuffer({
        buffer,
        fileName: file.name,
        contentType,
        userId: user?.id ?? null,
      });

      set.status = 201;
      return { url };
    } catch (error) {
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  },
  { tags: [TAG], summary: "Upload image via server-side Supabase storage" },
);

uploadRouter.delete(
  "/image",
  async ({ body, user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const publicUrl = String(body?.url ?? "").trim();
    if (!publicUrl) {
      set.status = 400;
      return { error: "Missing image url" };
    }

    try {
      const deleted = await deleteImageByPublicUrl(publicUrl);
      if (!deleted) {
        set.status = 400;
        return { error: "Invalid or unsupported image url" };
      }

      return { success: true };
    } catch (error) {
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Delete failed",
      };
    }
  },
  { tags: [TAG], summary: "Delete uploaded image via server-side Supabase storage" },
);

export default uploadRouter;
