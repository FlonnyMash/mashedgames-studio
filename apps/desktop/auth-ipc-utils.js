const fs = require("node:fs");
const path = require("node:path");
const { app, ipcMain, safeStorage } = require("electron");
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const TOKEN_FILE = "mashed-auth.bin";

// ---------------------------------------------------------------------------
// In-memory session state.
// access_token and refresh_token NEVER leave this module.
// The renderer only ever receives { isAuthenticated: boolean, email: string|null }.
// ---------------------------------------------------------------------------

/** @type {{ access_token: string, refresh_token: string, expires_at: number, email: string|null, user: object } | null} */
let _session = null;

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let _supabase = null;

// ---------------------------------------------------------------------------
// Supabase client (lazy-initialised; fails gracefully if env vars are absent)
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  if (_supabase) return _supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "[auth] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  _supabase = createClient(url, key, {
    auth: {
      // We manage persistence ourselves via safeStorage, so supabase-js must not
      // attempt to read/write localStorage or any other storage mechanism.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "mashed-auth-noop",
    },
    // Electron main process runs Node.js < 22 which has no native WebSocket.
    // Provide the ws package so the realtime transport initialises cleanly.
    // Auth-only usage means no realtime channels are ever opened.
    realtime: {
      transport: ws,
    },
  });

  return _supabase;
}

// ---------------------------------------------------------------------------
// safeStorage helpers — OS-level encryption (DPAPI / Keychain / libsecret)
// ---------------------------------------------------------------------------

function getTokenPath() {
  return path.join(app.getPath("userData"), TOKEN_FILE);
}

/**
 * Encrypts and writes a session snapshot to disk.
 * Only the access_token, refresh_token, expires_at, and email are persisted —
 * never the full user object or any internal Supabase state.
 *
 * If safeStorage encryption is unavailable (e.g. headless Linux without a
 * keyring daemon), the session is held in memory only and this function is a
 * no-op.
 */
function persistSession(session) {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(
      "[auth] safeStorage unavailable — session will not be persisted to disk.",
    );
    return;
  }

  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    email: session.email ?? null,
  });

  try {
    // encryptString() returns a Buffer of OS-encrypted bytes.
    // These bytes can only be decrypted by the same OS user on the same machine.
    const encrypted = safeStorage.encryptString(payload);
    fs.writeFileSync(getTokenPath(), encrypted);
  } catch (error) {
    console.error("[auth] Failed to persist session:", error);
  }
}

/**
 * Reads and decrypts the persisted session file.
 * Returns null if no file exists, safeStorage is unavailable, or decryption fails.
 * Corrupted / undecryptable files are deleted automatically.
 */
function readPersistedSession() {
  const tokenPath = getTokenPath();

  if (!fs.existsSync(tokenPath)) return null;

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(
      "[auth] safeStorage unavailable — cannot read persisted session.",
    );
    return null;
  }

  try {
    const encrypted = fs.readFileSync(tokenPath);
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error(
      "[auth] Failed to read or decrypt token file — clearing corrupted file:",
      error,
    );
    clearPersistedSession();
    return null;
  }
}

/**
 * Removes the persisted session file.
 *
 * Returns true when the file is gone (either deleted or was never present).
 * Returns false when the OS-level deletion throws — the caller must treat
 * this as a critical failure and notify the renderer accordingly.
 * The raw error is logged here; callers must NOT re-log error.message.
 */
function clearPersistedSession() {
  try {
    const tokenPath = getTokenPath();
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
    return true;
  } catch (error) {
    console.error("[auth] Failed to delete token file:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Authenticated per-request client — used for RLS-gated profile queries
// ---------------------------------------------------------------------------

/**
 * Creates a short-lived Supabase client that carries the user's JWT in the
 * Authorization header.  This causes PostgREST to evaluate RLS policies as
 * the `authenticated` role, which is required for any query against tables
 * that restrict anonymous reads.
 *
 * The client intentionally disables session persistence and auto-refresh —
 * token lifecycle is managed exclusively by the auth IPC layer.
 *
 * @param {string} accessToken  The user's current Supabase JWT.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function buildAuthenticatedClient(accessToken) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "[auth] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
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

// ---------------------------------------------------------------------------
// Status payload — the only shape ever sent to the renderer
// ---------------------------------------------------------------------------

function buildStatusPayload(session) {
  return {
    isAuthenticated: session !== null,
    email: session?.email ?? null,
    userId: session?.user?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Session restore (called once at startup, before the main window opens)
// ---------------------------------------------------------------------------

/**
 * Attempts to restore a persisted session from disk.
 *
 * Flow:
 *  1. Read + decrypt mashed-auth.bin from userData.
 *  2. Call supabase.auth.setSession({ access_token, refresh_token }).
 *     - If the access token is still valid, Supabase sets it in memory (no network call).
 *     - If it is expired, Supabase calls the refresh endpoint and returns new tokens.
 *  3. Persist the (potentially refreshed) tokens back to disk.
 *  4. On any failure: clear the file and continue unauthenticated.
 *
 * A 6-second safety timeout is applied to the Supabase refresh network call so that
 * a slow/offline network does not block the splash screen indefinitely.
 */
async function restoreSession() {
  const persisted = readPersistedSession();
  if (!persisted?.refresh_token) return;

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (error) {
    // Supabase not configured yet (env vars absent). This is expected in
    // local development before Supabase is provisioned.
    console.info("[auth] Supabase not configured:", error.message);
    return;
  }

  let data, error;
  try {
    const RESTORE_TIMEOUT_MS = 6000;
    // Prefer refreshSession over setSession — ES256 access tokens cannot be
    // verified locally by older client paths (unrecognized JWT kid). Refresh
    // exchanges the refresh_token with GoTrue and returns a fresh session.
    const restorePromise = supabase.auth.refreshSession({
      refresh_token: persisted.refresh_token,
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Session restore timed out after 6s")),
        RESTORE_TIMEOUT_MS,
      ),
    );
    ({ data, error } = await Promise.race([restorePromise, timeoutPromise]));
  } catch (err) {
    console.warn("[auth] Session restore failed or timed out:", err.message);
    clearPersistedSession();
    _session = null;
    return;
  }

  if (error || !data?.session) {
    console.warn(
      "[auth] Persisted session rejected by Supabase — clearing:",
      error?.message ?? "no session returned",
    );
    clearPersistedSession();
    _session = null;
    return;
  }

  _session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    email: data.session.user?.email ?? null,
    user: data.session.user,
  };

  // Persist refreshed tokens so the next startup uses the latest refresh token.
  persistSession(_session);
  console.info("[auth] Session restored for:", _session.email);
}

// ---------------------------------------------------------------------------
// IPC channel handlers
// ---------------------------------------------------------------------------

async function handleLogin(_event, payload) {
  if (
    !payload ||
    typeof payload.email !== "string" ||
    typeof payload.password !== "string"
  ) {
    return {
      isAuthenticated: false,
      email: null,
      userId: null,
      error: "Invalid login payload.",
    };
  }

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (error) {
    return { isAuthenticated: false, email: null, userId: null, error: error.message };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });

  if (error || !data?.session) {
    return {
      isAuthenticated: false,
      email: null,
      userId: null,
      error: error?.message ?? "Login failed.",
    };
  }

  _session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    email: data.session.user?.email ?? null,
    user: data.session.user,
  };

  persistSession(_session);
  return buildStatusPayload(_session);
}

/**
 * Handles auth:logout / auth wipe IPC requests from the renderer.
 *
 * Sequence (mirrors the renderer-side directive):
 *  1. Best-effort remote Supabase sign-out (revokes the refresh token
 *     server-side; network failures are non-fatal).
 *  2. Clear the in-memory session immediately so auth:get-status reflects
 *     the signed-out state even if the disk wipe subsequently fails.
 *  3. Delete the OS-encrypted token file and log success or critical failure.
 *     Tokens are NEVER logged — only boolean wipe status and error objects.
 *  4. Return { isAuthenticated: false, email: null, userId: null, wiped }
 *     so the renderer can detect and surface disk-wipe failures if needed.
 */
async function handleLogout(_event) {
  console.info("[auth:logout] Token wipe requested by renderer.");

  // Step 1 — best-effort remote sign-out.
  if (_session) {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } catch (err) {
      // Non-fatal: the local wipe proceeds regardless.
      console.warn(
        "[auth:logout] Remote sign-out failed — continuing local wipe:",
        err.message ?? String(err),
      );
    }
  }

  // Step 2 — wipe in-memory state before touching disk.
  _session = null;

  // Step 3 — delete the OS-encrypted token file.
  const wiped = clearPersistedSession();

  if (wiped) {
    console.info("[auth:logout] Token file wiped successfully.");
  } else {
    // The encrypted file may persist on disk. Because it can only be
    // decrypted by the same OS user account on the same machine (DPAPI /
    // Keychain / libsecret), this is not an immediate cross-user security
    // risk, but should be investigated.
    console.error(
      "[auth:logout] CRITICAL: OS-level token file deletion failed. " +
        "Encrypted file may persist on disk. " +
        "In-memory session cleared; re-authentication will be required.",
    );
  }

  // Step 4 — return status to renderer. The `wiped` boolean lets the renderer
  // surface a warning if the disk wipe failed without exposing any token data.
  return { isAuthenticated: false, email: null, userId: null, wiped };
}

function handleGetStatus(_event) {
  return buildStatusPayload(_session);
}

/**
 * IPC handler for `auth:get-profile`.
 *
 * Builds a short-lived authenticated Supabase client from the in-memory JWT
 * and queries the `profiles` row for the current user, joining the linked
 * `organizations` row to retrieve name and plan.
 *
 * This handler exists because the renderer's Supabase client is always
 * anonymous (tokens are secured in the main process), so any RLS-protected
 * query from the renderer fails with a permission error.  By running the
 * query here, we satisfy RLS via the Authorization header without ever
 * exposing the token to the renderer.
 *
 * Response shape:
 *   { ok: true,  profile: { role: string|null, org: { name, plan }|null } }
 *   { ok: false, error: string }
 */
async function handleGetProfile(_event) {
  if (!_session?.access_token) {
    return { ok: false, error: "NOT_AUTHENTICATED" };
  }

  const userId = _session.user?.id;
  if (!userId) {
    return { ok: false, error: "NOT_AUTHENTICATED" };
  }

  let supabase;
  try {
    supabase = buildAuthenticatedClient(_session.access_token);
  } catch (err) {
    console.error("[auth:get-profile] Failed to build authenticated client:", err.message);
    return { ok: false, error: err.message };
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, organizations(name, plan)")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[auth:get-profile] Query failed:", error.message);
      return { ok: false, error: error.message };
    }

    const raw = data?.organizations;
    const org =
      raw && !Array.isArray(raw)
        ? { name: raw.name, plan: raw.plan }
        : null;

    return {
      ok: true,
      profile: {
        role: data?.role ?? null,
        org,
      },
    };
  } catch (err) {
    console.error("[auth:get-profile] Unexpected error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Registration — called once from app.whenReady()
// ---------------------------------------------------------------------------

/**
 * Restores any persisted session and registers the four auth IPC channels:
 *   auth:login       { email, password }  → { isAuthenticated, email, error? }
 *   auth:logout      (no payload)         → { isAuthenticated: false, email: null }
 *   auth:get-status  (no payload)         → { isAuthenticated, email }
 *   auth:get-profile (no payload)         → { ok, profile: { role, org }? }
 *
 * This function is async because session restore may involve a network call to
 * refresh an expired access token. Awaiting it before createMainWindow() ensures
 * that the first auth:get-status call from the renderer returns the correct state.
 */
async function registerAuthIpc() {
  await restoreSession();

  ipcMain.handle("auth:login", handleLogin);
  ipcMain.handle("auth:logout", handleLogout);
  ipcMain.handle("auth:get-status", handleGetStatus);
  ipcMain.handle("auth:get-profile", handleGetProfile);
}

/**
 * Returns a minimal session view for inter-module use within the main process.
 * Only access_token and user are exposed — refresh_token is never shared.
 * NEVER call this from the renderer or pass its return value through IPC.
 *
 * @returns {{ access_token: string, user: object } | null}
 */
function getSessionForInternal() {
  if (!_session) return null;
  return {
    access_token: _session.access_token,
    user: _session.user,
  };
}

/**
 * Attempts to refresh the current session using the stored refresh_token.
 * Updates `_session` and re-persists on success.
 *
 * Intended for intra-main-process use only (e.g. `admin-ipc-utils` retrying
 * after a 401 from the dashboard API). Never expose the return value to the
 * renderer — it carries the raw access_token.
 *
 * @returns {Promise<{ access_token: string, user: object } | null>}
 *   Updated session snapshot on success, or null on any failure.
 */
async function refreshSessionForInternal() {
  if (!_session?.refresh_token) {
    console.warn("[auth] refreshSessionForInternal: no refresh_token available.");
    return null;
  }

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (err) {
    console.warn("[auth] refreshSessionForInternal: Supabase not configured:", err.message);
    return null;
  }

  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: _session.refresh_token,
    });

    if (error || !data?.session) {
      console.warn(
        "[auth] refreshSessionForInternal: refresh failed —",
        error?.message ?? "no session returned",
      );
      return null;
    }

    _session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      email: data.session.user?.email ?? null,
      user: data.session.user,
    };

    persistSession(_session);
    console.info("[auth] refreshSessionForInternal: token refreshed for", _session.email);

    return {
      access_token: _session.access_token,
      user: _session.user,
    };
  } catch (err) {
    console.error("[auth] refreshSessionForInternal: unexpected error:", err.message ?? err);
    return null;
  }
}

module.exports = {
  registerAuthIpc,
  getSessionForInternal,
  refreshSessionForInternal,
  // Exported for unit testing only; not called externally in production.
  restoreSession,
  buildStatusPayload,
};
