import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Database } from "@/types/database.types";
import {
  readTemplateMeta,
  resolveTemplateMetaDir,
} from "@/lib/template-meta-io";

export const META_ASSETS_BUCKET = "template-assets";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export async function ensureMetaAssetsBucket(
  serviceClient: ReturnType<typeof createClient<Database>>,
): Promise<void> {
  const { data: buckets, error: listError } =
    await serviceClient.storage.listBuckets();

  if (listError) {
    console.warn("[template-meta-assets] Could not list storage buckets:", listError.message);
    return;
  }

  if (!buckets?.find((b) => b.name === META_ASSETS_BUCKET)) {
    const { error: createError } = await serviceClient.storage.createBucket(
      META_ASSETS_BUCKET,
      { public: true },
    );
    if (createError) {
      console.warn(
        `[template-meta-assets] Could not create "${META_ASSETS_BUCKET}" bucket:`,
        createError.message,
      );
    }
  }
}

export async function uploadMetaAsset(
  serviceClient: ReturnType<typeof createClient<Database>>,
  localPath: string,
  storagePath: string,
): Promise<string | null> {
  if (!existsSync(localPath)) {
    return null;
  }

  try {
    const buffer = readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    const { error: uploadError } = await serviceClient.storage
      .from(META_ASSETS_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
        cacheControl: "60",
      });

    if (uploadError) {
      console.error(
        `[template-meta-assets] Upload failed (${storagePath}):`,
        uploadError.message,
      );
      return null;
    }

    const {
      data: { publicUrl },
    } = serviceClient.storage.from(META_ASSETS_BUCKET).getPublicUrl(storagePath);

    return publicUrl;
  } catch (err) {
    console.error(`[template-meta-assets] Unexpected upload error (${localPath}):`, err);
    return null;
  }
}

export function resolveMetaAssetBasename(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.includes("file=")) {
    try {
      const query = trimmed.includes("?")
        ? trimmed.slice(trimmed.indexOf("?"))
        : `?${trimmed}`;
      const file = new URLSearchParams(query).get("file");
      if (file) return path.basename(file);
    } catch {
      // Fall through.
    }
  }

  return path.basename(trimmed.replace(/\\/g, "/"));
}

export type SlugStableMetaUrls = {
  description: string;
  tutorial: string;
  thumbnailUrl: string;
  previewUrls: string[];
};

/**
 * Read local template-meta.json, upload assets to slug-stable Storage paths,
 * and return public URLs for cloud metadata persistence.
 */
export async function resolveSlugStableMetaPublicUrls(
  serviceClient: ReturnType<typeof createClient<Database>>,
  templateSlug: string,
  fallback: { thumbnailUrl?: string; previewUrls?: string[] } = {},
): Promise<SlugStableMetaUrls> {
  const meta = readTemplateMeta(templateSlug);
  const metaDir = resolveTemplateMetaDir(templateSlug);
  const storagePrefix = `meta/${templateSlug}`;

  let thumbnailUrl = fallback.thumbnailUrl ?? "";
  if (meta.thumbnail) {
    const basename = resolveMetaAssetBasename(meta.thumbnail);
    const localPath = path.join(metaDir, basename);
    const url = await uploadMetaAsset(
      serviceClient,
      localPath,
      `${storagePrefix}/${basename}`,
    );
    if (url) thumbnailUrl = url;
  }

  const previewUrls: string[] = [];
  for (const previewFilename of meta.previews) {
    const basename = resolveMetaAssetBasename(previewFilename);
    if (!basename) continue;
    const localPath = path.join(metaDir, basename);
    const url = await uploadMetaAsset(
      serviceClient,
      localPath,
      `${storagePrefix}/${basename}`,
    );
    if (url) previewUrls.push(url);
  }

  if (previewUrls.length === 0 && fallback.previewUrls?.length) {
    previewUrls.push(...fallback.previewUrls);
  }

  return {
    description: meta.description,
    tutorial: meta.tutorial,
    thumbnailUrl,
    previewUrls,
  };
}

export function withPublishCacheBust(publicUrl: string, version: string): string {
  const separator = publicUrl.includes("?") ? "&" : "?";
  return `${publicUrl}${separator}v=${encodeURIComponent(version)}`;
}

export type VersionedMetaUrls = SlugStableMetaUrls;

/** Versioned asset paths for publish (cache-bust per semver). */
export async function resolveVersionedMetaPublicUrls(
  serviceClient: ReturnType<typeof createClient<Database>>,
  templateSlug: string,
  version: string,
  fallback: { thumbnailUrl?: string; previewUrls?: string[] } = {},
): Promise<VersionedMetaUrls> {
  const meta = readTemplateMeta(templateSlug);
  const metaDir = resolveTemplateMetaDir(templateSlug);
  const versionedPrefix = `meta/${templateSlug}/v${version}`;

  let thumbnailUrl = fallback.thumbnailUrl ?? "";
  if (meta.thumbnail) {
    const basename = resolveMetaAssetBasename(meta.thumbnail);
    const localPath = path.join(metaDir, basename);
    const url = await uploadMetaAsset(
      serviceClient,
      localPath,
      `${versionedPrefix}/${basename}`,
    );
    if (url) thumbnailUrl = withPublishCacheBust(url, version);
  }

  const previewUrls: string[] = [];
  for (const previewFilename of meta.previews) {
    const basename = resolveMetaAssetBasename(previewFilename);
    if (!basename) continue;
    const localPath = path.join(metaDir, basename);
    const url = await uploadMetaAsset(
      serviceClient,
      localPath,
      `${versionedPrefix}/${basename}`,
    );
    if (url) previewUrls.push(withPublishCacheBust(url, version));
  }

  if (previewUrls.length === 0 && fallback.previewUrls?.length) {
    previewUrls.push(...fallback.previewUrls);
  }

  return {
    description: meta.description,
    tutorial: meta.tutorial,
    thumbnailUrl,
    previewUrls,
  };
}
