import fs from "fs";
import { v2 as cloudinary } from "cloudinary";

let cloudinaryReady = false;
let warnedMissingConfig = false;

function configureCloudinaryIfNeeded() {
  if (cloudinaryReady) return true;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        "[mediaStorage] Cloudinary env missing; using local upload URLs fallback."
      );
    }
    return false;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  cloudinaryReady = true;
  return true;
}

export function getPublicBaseUrl(req) {
  if (process.env.PUBLIC_API_BASE_URL) {
    return process.env.PUBLIC_API_BASE_URL.replace(/\/$/, "");
  }

  const xfProto = req.headers["x-forwarded-proto"];
  const xfHost = req.headers["x-forwarded-host"];
  const protocol = (Array.isArray(xfProto) ? xfProto[0] : xfProto) || req.protocol;
  const host = (Array.isArray(xfHost) ? xfHost[0] : xfHost) || req.get("host");
  return `${protocol}://${host}`;
}

export async function uploadImageAndGetUrl({ req, file, folder, fallbackPath }) {
  if (!file) return null;

  const canUseCloudinary = configureCloudinaryIfNeeded();
  if (canUseCloudinary && file.path) {
    try {
      const uploaded = await cloudinary.uploader.upload(file.path, {
        folder,
        resource_type: "image",
      });
      return uploaded.secure_url;
    } finally {
      fs.unlink(file.path, () => {});
    }
  }

  const base = getPublicBaseUrl(req);
  return `${base}/uploads/${fallbackPath}`.replace(/\\/g, "/");
}
