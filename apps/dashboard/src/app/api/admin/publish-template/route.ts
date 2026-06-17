import { createClient } from "@supabase/supabase-js";
import { createHmac, createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { listTemplateOverviewFromDisk } from "@/lib/template-studio-meta";
import { gameEngineRoot } from "@/lib/template-library-root";
import {
  readTemplateMeta,
  resolveTemplateMetaDir,
} from "@/lib/template-meta-io";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PublishRequest = {
  templateId: string;
  tier?: "free" | "premium" | "enterprise";
};

type PublishResponse =
  | { ok: true; templateRowId: string; version: string; storageKey: string }
  | { ok: false; error: string };

const VALID_TIERS = new Set<string>(["free", "premium", "enterprise"]);

/** Bucket for compiled game bundles (private — served only to licensed clients). */
const BUNDLE_BUCKET = "template-bundles";

/** Bucket for public promotional assets (thumbnail, previews). Must be public. */
const META_ASSETS_BUCKET = "template-assets";

// ---------------------------------------------------------------------------
// Auth — same pattern as /api/admin/ref-data
// ---------------------------------------------------------------------------

async function verifyStudioAdmin(
  bearerToken: string,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ userId: string } | { error: string; status: number }> {
  const userClient = createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "Invalid or expired token.", status: 401 };
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: "User profile not found.", status: 403 };
  }
  if (profile.role !== "studio_admin") {
    return { error: "Forbidden: studio_admin role required.", status: 403 };
  }

  return { userId: userData.user.id };
}

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

function bumpPatchVersion(version: string): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "1.0.1";
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

async function resolveNextVersion(
  serviceClient: ReturnType<typeof createClient<Database>>,
  templateSlug: string,
): Promise<string> {
  const { data } = await serviceClient
    .from("templates")
    .select("version")
    .eq("template_slug", templateSlug)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.version) return "1.0.0";
  return bumpPatchVersion(data.version);
}

// ---------------------------------------------------------------------------
// Bundle builder — packages the compiled game-engine dist as a JSON manifest
// ---------------------------------------------------------------------------

type BundleEntry = { path: string; sizeBytes: number };

function collectDistFiles(dir: string, base: string): BundleEntry[] {
  const entries: BundleEntry[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.join(base, name).replace(/\\/g, "/");
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push(...collectDistFiles(full, rel));
    } else {
      entries.push({ path: rel, sizeBytes: stat.size });
    }
  }
  return entries;
}

function buildEngineBundle(
  templateSlug: string,
  displayName: string,
): { ok: true; buffer: Buffer } | { ok: false; error: string } {
  const distDir = path.join(gameEngineRoot, "dist");

  if (!existsSync(distDir)) {
    return {
      ok: false,
      error:
        "Game engine dist not found. Run `pnpm build` inside apps/game-engine first.",
    };
  }

  const indexPath = path.join(distDir, "index.html");
  const indexHtml = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : null;

  const files = collectDistFiles(distDir, "");

  const manifest = {
    templateSlug,
    displayName,
    bundledAt: new Date().toISOString(),
    entrypoint: "index.html",
    files,
    indexHtml,
  };

  return { ok: true, buffer: Buffer.from(JSON.stringify(manifest), "utf8") };
}

// ---------------------------------------------------------------------------
// Meta asset helpers
// ---------------------------------------------------------------------------

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/**
 * Ensure the public `template-assets` bucket exists. Non-fatal if creation
 * fails — the upload attempt will surface the error instead.
 */
async function ensureMetaAssetsBucket(
  serviceClient: ReturnType<typeof createClient<Database>>,
): Promise<void> {
  const { data: buckets, error: listError } =
    await serviceClient.storage.listBuckets();

  if (listError) {
    console.warn(
      "[publish-template] Could not list storage buckets:",
      listError.message,
    );
    return;
  }

  if (!buckets?.find((b) => b.name === META_ASSETS_BUCKET)) {
    const { error: createError } = await serviceClient.storage.createBucket(
      META_ASSETS_BUCKET,
      { public: true },
    );
    if (createError) {
      console.warn(
        `[publish-template] Could not create "${META_ASSETS_BUCKET}" bucket:`,
        createError.message,
      );
    } else {
      console.info(
        `[publish-template] Created public storage bucket "${META_ASSETS_BUCKET}".`,
      );
    }
  }
}

/**
 * Upload a single local meta asset file to Storage and return its public URL.
 * Returns null on any failure — meta upload errors never abort the publish.
 */
async function uploadMetaAsset(
  serviceClient: ReturnType<typeof createClient<Database>>,
  localPath: string,
  storagePath: string,
): Promise<string | null> {
  if (!existsSync(localPath)) {
    console.warn(
      `[publish-template] Meta asset not found on disk, skipping: ${localPath}`,
    );
    return null;
  }

  try {
    const buffer = readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    const { error: uploadError } = await serviceClient.storage
      .from(META_ASSETS_BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (uploadError) {
      console.error(
        `[publish-template] Meta asset upload failed (${storagePath}):`,
        uploadError.message,
      );
      return null;
    }

    const {
      data: { publicUrl },
    } = serviceClient.storage.from(META_ASSETS_BUCKET).getPublicUrl(storagePath);

    return publicUrl;
  } catch (err) {
    console.error(
      `[publish-template] Unexpected error uploading meta asset (${localPath}):`,
      err,
    );
    return null;
  }
}

type MetaPublicUrls = {
  description: string;
  tutorial: string;
  thumbnailUrl: string;
  previewUrls: string[];
};

/**
 * Read local template-meta.json, upload any referenced assets to
 * Supabase Storage, and return the resolved public URLs.
 * All storage errors are non-fatal — the publish continues regardless.
 */
async function resolveMetaPublicUrls(
  serviceClient: ReturnType<typeof createClient<Database>>,
  templateId: string,
): Promise<MetaPublicUrls> {
  const meta = readTemplateMeta(templateId);
  const metaDir = resolveTemplateMetaDir(templateId);

  // Thumbnail
  let thumbnailUrl = "";
  if (meta.thumbnail) {
    const localPath = path.join(metaDir, path.basename(meta.thumbnail));
    const storagePath = `meta/${templateId}/${path.basename(meta.thumbnail)}`;
    const url = await uploadMetaAsset(serviceClient, localPath, storagePath);
    if (url) thumbnailUrl = url;
  }

  // Previews (preserve order)
  const previewUrls: string[] = [];
  for (const previewFilename of meta.previews) {
    const basename = path.basename(previewFilename);
    const localPath = path.join(metaDir, basename);
    const storagePath = `meta/${templateId}/${basename}`;
    const url = await uploadMetaAsset(serviceClient, localPath, storagePath);
    if (url) previewUrls.push(url);
  }

  return {
    description: meta.description,
    tutorial: meta.tutorial,
    thumbnailUrl,
    previewUrls,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json<PublishResponse>(
      { ok: false, error: "Server misconfiguration." },
      { status: 500 },
    );
  }

  // --- Auth ---
  const authHeader = request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!bearerToken) {
    return Response.json<PublishResponse>(
      { ok: false, error: "Authorization header with Bearer token required." },
      { status: 401 },
    );
  }

  const authResult = await verifyStudioAdmin(bearerToken, supabaseUrl, anonKey);
  if ("error" in authResult) {
    return Response.json<PublishResponse>(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }

  // --- Input ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json<PublishResponse>(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const { templateId, tier = "free" } = (body ?? {}) as Partial<PublishRequest>;

  if (!templateId || typeof templateId !== "string") {
    return Response.json<PublishResponse>(
      { ok: false, error: "templateId is required." },
      { status: 400 },
    );
  }

  if (!VALID_TIERS.has(tier)) {
    return Response.json<PublishResponse>(
      { ok: false, error: 'tier must be "free", "premium", or "enterprise".' },
      { status: 400 },
    );
  }

  // Validate the templateId exists on disk.
  const knownTemplates = listTemplateOverviewFromDisk();
  const templateMeta = knownTemplates.find((t) => t.id === templateId);
  if (!templateMeta) {
    return Response.json<PublishResponse>(
      { ok: false, error: `Template "${templateId}" not found on disk.` },
      { status: 404 },
    );
  }

  // --- Build bundle ---
  const bundleResult = buildEngineBundle(templateId, templateMeta.displayName);
  if (!bundleResult.ok) {
    return Response.json<PublishResponse>(
      { ok: false, error: bundleResult.error },
      { status: 422 },
    );
  }

  const bundleBuffer = bundleResult.buffer;

  const checksum = createHash("sha256").update(bundleBuffer).digest("hex");
  const bundleSignature = createHmac("sha256", serviceRoleKey)
    .update(bundleBuffer)
    .digest("hex");

  // --- Service-role client for DB + Storage ---
  const serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Determine version ---
  const version = await resolveNextVersion(serviceClient, templateId);
  const storageKey = `${templateId}/v${version}.json`;

  // --- Ensure the private bundle bucket exists ---
  const { data: buckets, error: listBucketsError } =
    await serviceClient.storage.listBuckets();

  if (!listBucketsError && !buckets?.find((b) => b.name === BUNDLE_BUCKET)) {
    const { error: createError } = await serviceClient.storage.createBucket(
      BUNDLE_BUCKET,
      { public: false },
    );
    if (createError) {
      console.error(
        "[publish-template] Failed to create bundle storage bucket:",
        createError,
      );
      return Response.json<PublishResponse>(
        {
          ok: false,
          error: `Could not create storage bucket: ${createError.message}`,
        },
        { status: 500 },
      );
    }
    console.info(`[publish-template] Created storage bucket "${BUNDLE_BUCKET}".`);
  }

  // --- Upload bundle to Supabase Storage ---
  const { error: uploadError } = await serviceClient.storage
    .from(BUNDLE_BUCKET)
    .upload(storageKey, bundleBuffer, {
      contentType: "application/json",
      upsert: false,
    });

  if (uploadError) {
    console.error("[publish-template] Storage upload failed:", uploadError);
    return Response.json<PublishResponse>(
      { ok: false, error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // --- Ensure the public meta-assets bucket exists (non-fatal) ---
  await ensureMetaAssetsBucket(serviceClient);

  // --- Upload local meta assets and resolve public URLs ---
  // Non-fatal: if meta uploads fail we still publish the bundle, just without
  // rich storefront content. Errors are already logged inside the helper.
  const metaUrls = await resolveMetaPublicUrls(serviceClient, templateId);

  console.info(
    `[publish-template] Meta resolved for ${templateId}: ` +
      `thumbnail=${metaUrls.thumbnailUrl ? "ok" : "none"}, ` +
      `previews=${metaUrls.previewUrls.length}`,
  );

  // --- Mark previous latest as stale ---
  await serviceClient
    .from("templates")
    .update({ is_latest: false })
    .eq("template_slug", templateId)
    .eq("is_latest", true);

  // --- Build DB payload (includes the four new meta columns) ---
  const manifest = {
    id: templateId,
    displayName: templateMeta.displayName,
    version,
    publishedAt: new Date().toISOString(),
  };

  const insertPayload = {
    template_slug: templateId,
    version,
    tier,
    checksum,
    bundle_signature: bundleSignature,
    storage_key: storageKey,
    manifest,
    is_latest: true,
    yanked: false,
    description: metaUrls.description,
    tutorial: metaUrls.tutorial,
    thumbnail_url: metaUrls.thumbnailUrl,
    preview_urls: metaUrls.previewUrls,
  };

  const { data: inserted, error: insertError } = await serviceClient
    .from("templates")
    .insert(insertPayload)
    .select("id")
    .single();

  // UNIQUE(template_slug) conflict → UPDATE the existing row instead.
  if (insertError?.code === "23505") {
    const { data: updated, error: updateError } = await serviceClient
      .from("templates")
      .update(insertPayload)
      .eq("template_slug", templateId)
      .select("id")
      .single();

    if (updateError || !updated) {
      console.error(
        "[publish-template] Update-after-conflict failed:",
        updateError,
      );
      await serviceClient.storage.from(BUNDLE_BUCKET).remove([storageKey]);
      return Response.json<PublishResponse>(
        { ok: false, error: updateError?.message ?? "Database update failed." },
        { status: 500 },
      );
    }

    console.info(
      `[publish-template] Re-published (update): slug=${templateId} v=${version} ` +
        `tier=${tier} id=${updated.id} by=${authResult.userId}`,
    );

    return Response.json<PublishResponse>(
      { ok: true, templateRowId: updated.id, version, storageKey },
      { status: 200 },
    );
  }

  if (insertError || !inserted) {
    console.error("[publish-template] Insert failed:", insertError);
    await serviceClient.storage.from(BUNDLE_BUCKET).remove([storageKey]);
    return Response.json<PublishResponse>(
      { ok: false, error: insertError?.message ?? "Database insert failed." },
      { status: 500 },
    );
  }

  console.info(
    `[publish-template] Published: slug=${templateId} v=${version} ` +
      `tier=${tier} id=${inserted.id} by=${authResult.userId}`,
  );

  return Response.json<PublishResponse>(
    { ok: true, templateRowId: inserted.id, version, storageKey },
    { status: 201 },
  );
}
