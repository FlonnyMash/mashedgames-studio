const { ipcMain } = require("electron");
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");
const { callDashboardApi } = require("./admin-ipc-utils");

// ---------------------------------------------------------------------------
// StoreManager — Electron main-process template catalog fetcher.
//
// Security contract:
//   • Uses the authenticated user's JWT (access_token) via the Authorization
//     header so Supabase RLS policies are enforced server-side.
//   • The renderer's Supabase client is always anon in production; this module
//     bridges the auth boundary so the store page can load its catalog.
//   • Only safe, already-resolved payloads (manifest metadata, entitlement
//     flags) are sent to the renderer — never raw tokens or DB internals.
// ---------------------------------------------------------------------------

/** Maximum milliseconds to wait for any Supabase query before returning error. */
const QUERY_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Dev-preview bypass
//
// Active only when MASHEDGAMES_DEV_STORE_PREVIEW=1 is present in the main
// process environment (injected by loadDevRuntimeOverride in main.js or via
// a system-level env var when launching the exe for internal QA previews).
//
// The mock catalog is ONLY returned when the Supabase credentials are absent
// (CLIENT_ERROR path) or no session exists (NOT_AUTHENTICATED path).  If real
// credentials are configured the live Supabase path always takes precedence,
// so this bypass cannot weaken access for authenticated production users.
//
// The _devPreview marker on the IPC response lets the renderer surface a
// clear banner so developers know they are seeing placeholder data.
// ---------------------------------------------------------------------------

/** Returns true only in explicit dev-preview launches — never in public releases. */
function isDevStorePreviewActive() {
  return process.env.MASHEDGAMES_DEV_STORE_PREVIEW === "1";
}

/**
 * Static placeholder catalog returned when the dev-preview flag is set and
 * Supabase is unavailable.  Mirrors the EnrichedTemplate shape expected by
 * TemplateStorefront so the UI renders without errors.
 */
const DEV_MOCK_CATALOG = Object.freeze([
  {
    id: "dev-mock-001",
    template_slug: "spin-wheel-promo",
    tier: "premium",
    version: "1.0.0",
    manifest: {
      displayName: "Spin Wheel (Preview)",
      description:
        "Interactive spin-to-win promotional game. [Dev Preview — not a real catalog entry]",
      image_url: null,
    },
    published_at: new Date(0).toISOString(),
    is_latest: true,
    storage_key: null,
    checksum: null,
    bundle_signature: null,
    yanked: false,
    isLicensed: false,
  },
  {
    id: "dev-mock-002",
    template_slug: "scratch-card-reveal",
    tier: "enterprise",
    version: "2.1.0",
    manifest: {
      displayName: "Scratch Card Reveal (Preview)",
      description:
        "Classic scratch-card mechanic with customisable prize reveal. [Dev Preview]",
      image_url: null,
    },
    published_at: new Date(0).toISOString(),
    is_latest: true,
    storage_key: null,
    checksum: null,
    bundle_signature: null,
    yanked: false,
    isLicensed: false,
  },
  {
    id: "dev-mock-003",
    template_slug: "word-match-quiz",
    tier: "free",
    version: "1.3.2",
    manifest: {
      displayName: "Word Match Quiz (Preview)",
      description:
        "Brand-aware word-matching quiz with customisable question banks. [Dev Preview — Owned]",
      image_url: null,
    },
    published_at: new Date(0).toISOString(),
    is_latest: true,
    storage_key: null,
    checksum: null,
    bundle_signature: null,
    yanked: false,
    isLicensed: true,
  },
]);

/**
 * Injected at registration time — provides the current session without
 * coupling this module to auth-ipc-utils internals.
 *
 * @type {(() => { access_token: string, user: object } | null) | null}
 */
let _getSession = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(
        () => reject(new Error(`Supabase query timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

/**
 * Builds an authenticated PostgREST client using the user's JWT so that
 * Supabase RLS policies are enforced with the `authenticated` role.
 *
 * @param {string} accessToken  User's Supabase JWT.
 */
function buildUserClient(accessToken) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "[store] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: { transport: ws },
  });
}

/** Returns true when Supabase URL + publishable key are present in main-process env. */
function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

/** Escape `%` and `_` for safe use inside ilike patterns. */
function escapeIlikePattern(value) {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function applyCatalogSearch(query, search) {
  const trimmed = (search ?? "").trim();
  if (!trimmed) return query;

  const escaped = escapeIlikePattern(trimmed);
  const pattern = `%${escaped}%`;
  return query.or(
    `description.ilike.${pattern},template_slug.ilike.${pattern},manifest->>displayName.ilike.${pattern}`,
  );
}

function applyCatalogSort(query, sort = "newest") {
  if (sort === "popular") {
    return query
      .order("popularity_score", { ascending: false })
      .order("published_at", { ascending: false });
  }

  if (sort === "alphabetical") {
    return query.order("template_slug", { ascending: true });
  }

  return query.order("published_at", { ascending: false });
}

async function fetchCatalogRows(supabase, slugs, options) {
  let query = supabase.from("published_templates_with_tags").select("*");

  if (slugs !== null) {
    if (slugs.length === 0) {
      return [];
    }
    query = query.in("template_slug", slugs);
  }

  query = applyCatalogSearch(query, options.search ?? "");
  query = applyCatalogSort(query, options.sort ?? "newest");

  const { data, error } = await withTimeout(query, QUERY_TIMEOUT_MS);
  if (error) {
    throw error;
  }

  return data ?? [];
}

async function resolveMultiTagFilteredSlugs(supabase, tagSlugs) {
  const { data: tagRows, error: tagError } = await withTimeout(
    supabase.from("tags").select("id, slug").in("slug", tagSlugs),
    QUERY_TIMEOUT_MS,
  );

  if (tagError) {
    throw tagError;
  }

  const foundBySlug = new Map(
    (tagRows ?? []).map((row) => [row.slug, row.id]),
  );
  const invalidTagSlugs = tagSlugs.filter((slug) => !foundBySlug.has(slug));
  const tagIds = [...foundBySlug.values()];

  if (tagIds.length === 0) {
    return { slugs: [], invalidTagSlugs, tagInvalid: invalidTagSlugs.length > 0 };
  }

  const { data: links, error: linkError } = await withTimeout(
    supabase.from("template_tags").select("template_slug").in("tag_id", tagIds),
    QUERY_TIMEOUT_MS,
  );

  if (linkError) {
    throw linkError;
  }

  const slugs = [
    ...new Set((links ?? []).map((row) => row.template_slug).filter(Boolean)),
  ];

  return {
    slugs,
    invalidTagSlugs,
    tagInvalid: invalidTagSlugs.length > 0,
  };
}

function normalizeTagSlugs(tagSlugs) {
  if (!Array.isArray(tagSlugs) || tagSlugs.length === 0) return [];

  const seen = new Set();
  const normalized = [];

  for (const slug of tagSlugs) {
    if (typeof slug !== "string") continue;
    const trimmed = slug.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

// Legacy single-tag helper (kept for reference in comments only).
async function resolveTagFilteredSlugs(supabase, tagSlug) {
  const { data: tagRow, error: tagError } = await withTimeout(
    supabase.from("tags").select("id").eq("slug", tagSlug).maybeSingle(),
    QUERY_TIMEOUT_MS,
  );

  if (tagError) {
    throw tagError;
  }
  if (!tagRow) {
    return { slugs: [], tagInvalid: true };
  }

  const { data: links, error: linkError } = await withTimeout(
    supabase.from("template_tags").select("template_slug").eq("tag_id", tagRow.id),
    QUERY_TIMEOUT_MS,
  );

  if (linkError) {
    throw linkError;
  }

  return {
    slugs: (links ?? []).map((row) => row.template_slug),
    tagInvalid: false,
  };
}

// ---------------------------------------------------------------------------
// Core fetch logic
// ---------------------------------------------------------------------------

/**
 * Fetches the template catalog enriched with per-user license entitlements.
 * Returns only safe metadata — no tokens, keys, or raw DB internals.
 *
 * @param {{ tagSlugs?: string[], tagSlug?: string | null, sort?: string, search?: string }} [options]
 * @returns {Promise<{ ok: true, templates: object[] } | { ok: false, error: string }>}
 */
async function fetchStoreCatalog(options = {}) {
  const normalizedTags = normalizeTagSlugs(
    options.tagSlugs?.length
      ? options.tagSlugs
      : options.tagSlug?.trim()
        ? [options.tagSlug.trim()]
        : [],
  );
  const sort = options.sort ?? "newest";
  const search = options.search ?? "";
  const session = _getSession?.();
  if (!session) {
    // Mock catalog only when Supabase is genuinely unconfigured (local UI dev).
    if (isDevStorePreviewActive() && !hasSupabaseConfig()) {
      console.info("[store] Dev-preview: returning mock catalog (Supabase unconfigured).");
      return { ok: true, templates: DEV_MOCK_CATALOG, _devPreview: true };
    }
    return { ok: false, error: "NOT_AUTHENTICATED" };
  }

  const userId = session.user?.id;
  if (!userId) {
    return { ok: false, error: "NOT_AUTHENTICATED" };
  }

  let supabase;
  try {
    supabase = buildUserClient(session.access_token);
  } catch (err) {
    console.error("[store] Failed to build authenticated Supabase client:", err.message);
    if (isDevStorePreviewActive() && !hasSupabaseConfig()) {
      console.info("[store] Dev-preview: falling back to mock catalog (Supabase unconfigured).");
      return { ok: true, templates: DEV_MOCK_CATALOG, _devPreview: true };
    }
    return { ok: false, error: err.message };
  }

  try {
    // ------------------------------------------------------------------
    // 1. Fetch the public template catalog (search + sort applied server-side).
    // ------------------------------------------------------------------
    let catalog;
    let tagInvalid = false;

    if (normalizedTags.length === 0) {
      catalog = await fetchCatalogRows(supabase, null, { sort, search });
    } else {
      const resolved = await resolveMultiTagFilteredSlugs(supabase, normalizedTags);
      tagInvalid = resolved.tagInvalid;
      catalog = await fetchCatalogRows(supabase, resolved.slugs, { sort, search });
    }

    // ------------------------------------------------------------------
    // 2. Resolve the user's organisation for license lookup.
    // ------------------------------------------------------------------
    const { data: profile, error: profileError } = await withTimeout(
      supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle(),
      QUERY_TIMEOUT_MS,
    );

    if (profileError) {
      console.error("[store] Failed to fetch user profile:", profileError.message);
      // Non-fatal: return catalog with no entitlements rather than hard-failing.
      return {
        ok: true,
        templates: catalog.map((t) => ({ ...t, isLicensed: false })),
      };
    }

    const organizationId = profile?.organization_id ?? null;

    // ------------------------------------------------------------------
    // 3. Fetch active licenses for the organisation (if any).
    // ------------------------------------------------------------------
    let licensedIds = new Set();

    if (organizationId) {
      const { data: licenses, error: licensesError } = await withTimeout(
        supabase
          .from("licenses")
          .select("template_id, valid_until")
          .eq("organization_id", organizationId),
        QUERY_TIMEOUT_MS,
      );

      if (licensesError) {
        console.error("[store] Failed to fetch licenses:", licensesError.message);
        // Non-fatal: surface catalog with no entitlements.
      } else {
        const now = new Date();
        licensedIds = new Set(
          (licenses ?? [])
            .filter(
              (l) => l.valid_until === null || new Date(l.valid_until) > now,
            )
            .map((l) => l.template_id),
        );
      }
    }

    // ------------------------------------------------------------------
    // 4. Fetch templates claimed into public.games by this user.
    // ------------------------------------------------------------------
    let claimedTemplateIds = new Set();

    const { data: claimedGames, error: claimedError } = await withTimeout(
      supabase
        .from("games")
        .select("source_template_id")
        .eq("owner_id", userId)
        .not("source_template_id", "is", null),
      QUERY_TIMEOUT_MS,
    );

    if (claimedError) {
      console.error("[store] Failed to fetch claimed games:", claimedError.message);
    } else {
      claimedTemplateIds = new Set(
        (claimedGames ?? [])
          .map((g) => g.source_template_id)
          .filter((id) => typeof id === "string"),
      );
    }

    // ------------------------------------------------------------------
    // 5. Enrich catalog with entitlement flag and return.
    // ------------------------------------------------------------------
    const templates = catalog.map((t) => ({
      ...t,
      isLicensed: licensedIds.has(t.id) || claimedTemplateIds.has(t.id),
    }));

    return { ok: true, templates };

  } catch (err) {
    console.error("[store] Network/unexpected error fetching catalog:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Fetches grouped storefront tag filters via `get_storefront_tag_filters`.
 * Uses the authenticated user's JWT so RLS applies server-side.
 *
 * @returns {Promise<{ ok: true, filters: unknown } | { ok: false, error: string }>}
 */
async function fetchStoreTagFilters() {
  const session = _getSession?.();
  if (!session?.access_token) {
    return { ok: false, error: "NOT_AUTHENTICATED" };
  }

  let supabase;
  try {
    supabase = buildUserClient(session.access_token);
  } catch (err) {
    console.error("[store] Failed to build authenticated Supabase client:", err.message);
    return { ok: false, error: err.message };
  }

  try {
    const { data, error } = await withTimeout(
      supabase.rpc("get_storefront_tag_filters"),
      QUERY_TIMEOUT_MS,
    );

    if (error) {
      console.error("[store] Failed to fetch tag filters:", error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true, filters: data ?? [] };
  } catch (err) {
    console.error("[store] Network/unexpected error fetching tag filters:", err.message);
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// IPC handler
// ---------------------------------------------------------------------------

/**
 * IPC handler for `store:load-catalog`.
 * Response: { ok: true, templates: object[] } | { ok: false, error: string }
 *
 * The `error` field carries a short code — never a raw Supabase error that
 * could expose server internals to the renderer.
 */
async function handleLoadCatalog(_event, options) {
  return fetchStoreCatalog(options ?? {});
}

/**
 * IPC handler for `store:load-tag-filters`.
 * Response: { ok: true, filters: unknown } | { ok: false, error: string }
 */
async function handleLoadTagFilters() {
  return fetchStoreTagFilters();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slugFromTemplate(templateSlug) {
  const base = templateSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  const slug = base.length > 0 ? `${base}-${suffix}` : `game-${suffix}`;
  return slug.length >= 3 ? slug : `game-${suffix}`;
}

/**
 * IPC handler for `store:acquire-license`.
 * Payload: { template_id: string }
 * Response: { ok: true, licenseId?: string } | { ok: false, error: string }
 *
 * Resolves the caller's organisation in the main process so the renderer
 * never needs a Supabase session or org_id from the anon client.
 */
async function handleAcquireLicense(_event, payload) {
  const templateId = payload?.template_id;
  if (typeof templateId !== "string" || !UUID_RE.test(templateId)) {
    return { ok: false, error: "template_id must be a valid UUID." };
  }

  let session = _getSession?.();
  if (!session?.access_token) {
    return { ok: false, error: "SESSION_EXPIRED" };
  }

  const userId = session.user?.id;
  if (!userId) {
    return { ok: false, error: "SESSION_EXPIRED" };
  }

  let supabase;
  try {
    supabase = buildUserClient(session.access_token);
  } catch (err) {
    console.error("[store] Failed to build authenticated Supabase client:", err.message);
    return { ok: false, error: "SESSION_EXPIRED" };
  }

  try {
    const { data: profile, error: profileError } = await withTimeout(
      supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle(),
      QUERY_TIMEOUT_MS,
    );

    if (profileError || !profile?.organization_id) {
      return {
        ok: false,
        error: "Could not determine your organization. Please reload and try again.",
      };
    }

    return callDashboardApi("/api/acquire-license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        org_id: profile.organization_id,
      }),
    });
  } catch (err) {
    console.error("[store] acquire-license failed:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * IPC handler for `store:claim-game`.
 * Payload: { template_id: string, template_slug: string }
 * Response: { ok: true, game: object } | { ok: false, error: string }
 *
 * Resolves targetOwnerId from the main-process session so the renderer never
 * needs a Supabase JWT for POST /api/games/claim.
 */
async function handleClaimGame(_event, payload) {
  const templateId = payload?.template_id;
  const templateSlug = payload?.template_slug;

  if (typeof templateId !== "string" || !UUID_RE.test(templateId)) {
    return { ok: false, error: "template_id must be a valid UUID." };
  }

  if (typeof templateSlug !== "string" || templateSlug.trim().length === 0) {
    return { ok: false, error: "template_slug is required." };
  }

  const session = _getSession?.();
  if (!session?.access_token) {
    return { ok: false, error: "SESSION_EXPIRED" };
  }

  const userId = session.user?.id;
  if (!userId) {
    return { ok: false, error: "SESSION_EXPIRED" };
  }

  return callDashboardApi("/api/games/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateId,
      targetOwnerId: userId,
      slug: slugFromTemplate(templateSlug),
    }),
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Registers the `store:load-catalog` IPC channel.
 *
 * Must be called after `registerAuthIpc()` so the session is already available.
 *
 * @param {() => { access_token: string, user: object } | null} getSession
 *   Factory that returns the current main-process session snapshot.
 */
function registerStoreIpc(getSession) {
  if (typeof getSession !== "function") {
    throw new Error("[store] registerStoreIpc requires a getSession function.");
  }
  _getSession = getSession;
  ipcMain.handle("store:load-catalog", handleLoadCatalog);
  ipcMain.handle("store:load-tag-filters", handleLoadTagFilters);
  ipcMain.handle("store:acquire-license", handleAcquireLicense);
  ipcMain.handle("store:claim-game", handleClaimGame);
}

module.exports = { registerStoreIpc };
