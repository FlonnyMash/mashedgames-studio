const { ipcMain } = require("electron");

/** @type {(() => { access_token: string, user: object } | null) | null} */
let _getSession = null;
/** @type {(() => string | null) | null} */
let _getDashboardBaseUrl = null;
/** @type {(() => Promise<{ access_token: string, user: object } | null>) | null} */
let _refreshSession = null;

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

/**
 * Makes an authenticated HTTP request to the embedded dashboard API.
 *
 * On a 401 response the helper attempts a single token refresh via
 * `_refreshSession` and retries. This handles the common case where
 * the Supabase access_token (1-hour TTL) expires while the app is running
 * between startup and the admin action.
 *
 * @param {string} pathname  API path, e.g. "/api/admin/publish-template"
 * @param {RequestInit} [init]  Fetch init options (method, headers, body).
 * @returns {Promise<{ ok: boolean, [key: string]: unknown }>}
 */
async function callDashboardApi(pathname, init = {}) {
  if (!_getSession || !_getDashboardBaseUrl) {
    return { ok: false, status: 500, error: "ADMIN_IPC_NOT_INITIALIZED" };
  }

  let session = _getSession();
  if (!session?.access_token) {
    // Session is absent — attempt a single refresh before giving up.
    if (_refreshSession) {
      console.info("[admin-ipc] No session; attempting token refresh before", pathname);
      session = await _refreshSession();
    }
    if (!session?.access_token) {
      return { ok: false, status: 401, error: "SESSION_EXPIRED" };
    }
  }

  const baseUrl = _getDashboardBaseUrl();
  if (!baseUrl) {
    return { ok: false, status: 503, error: "DASHBOARD_NOT_READY" };
  }

  /**
   * Executes the fetch with the provided token and returns the parsed body.
   * Does NOT handle 401-retry here — the outer function handles that.
   *
   * @param {string} accessToken
   */
  async function executeRequest(accessToken) {
    const url = `${normalizeBaseUrl(baseUrl)}${pathname}`;
    const headers = {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await fetch(url, { ...init, headers });
    const body = await response.json().catch(() => null);

    return { response, body };
  }

  try {
    let { response, body } = await executeRequest(session.access_token);

    // On 401, attempt one token refresh and retry.
    if (response.status === 401 && _refreshSession) {
      console.info("[admin-ipc] 401 from", pathname, "— attempting token refresh and retry.");
      const refreshed = await _refreshSession();
      if (refreshed?.access_token) {
        ({ response, body } = await executeRequest(refreshed.access_token));
      }
    }

    if (!response.ok || !body) {
      return {
        ok: false,
        status: response.status,
        error:
          body && typeof body.error === "string"
            ? body.error
            : `HTTP_${response.status}`,
      };
    }

    return body;
  } catch (err) {
    return {
      ok: false,
      status: 503,
      error: err instanceof Error ? err.message : "NETWORK_ERROR",
    };
  }
}

async function handleAdminPublishTemplate(_event, payload) {
  return callDashboardApi("/api/admin/publish-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
}

async function handleAdminRefData() {
  return callDashboardApi("/api/admin/ref-data");
}

async function handleAdminProvisionLicense(_event, payload) {
  return callDashboardApi("/api/provision-license", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
}

const ALLOWED_ADMIN_FETCH_PREFIXES = [
  "/api/admin/tag-categories",
  "/api/admin/tags",
];

const TEMPLATE_TAGS_PATH = /^\/api\/templates\/[^/?#]+\/tags\/?$/;
const TEMPLATE_METADATA_PATH = /^\/api\/templates\/[^/?#]+\/metadata\/?$/;

function normalizeAdminFetchPathname(pathname) {
  if (typeof pathname !== "string") {
    return "";
  }

  let normalized = pathname.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.includes("://")) {
    try {
      normalized = new URL(normalized).pathname;
    } catch {
      return "";
    }
  }

  const queryIndex = normalized.indexOf("?");
  if (queryIndex >= 0) {
    normalized = normalized.slice(0, queryIndex);
  }

  const hashIndex = normalized.indexOf("#");
  if (hashIndex >= 0) {
    normalized = normalized.slice(0, hashIndex);
  }

  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function isAllowedAdminFetchPath(pathname) {
  const normalized = normalizeAdminFetchPathname(pathname);
  if (!normalized.startsWith("/api/")) {
    return false;
  }
  if (TEMPLATE_TAGS_PATH.test(normalized)) {
    return true;
  }
  if (TEMPLATE_METADATA_PATH.test(normalized)) {
    return true;
  }
  return ALLOWED_ADMIN_FETCH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

async function handleAdminTemplateMetadata(_event, payload) {
  const templateSlug =
    typeof payload?.templateSlug === "string" ? payload.templateSlug.trim() : "";
  const method = payload?.method ?? "GET";
  const body = payload?.body;

  if (!templateSlug) {
    return { ok: false, status: 400, error: "TEMPLATE_SLUG_REQUIRED" };
  }

  const pathname = `/api/templates/${encodeURIComponent(templateSlug)}/metadata`;
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  return callDashboardApi(pathname, init);
}

async function handleAdminFetch(_event, payload) {
  const pathname = normalizeAdminFetchPathname(payload?.pathname);
  const method = payload?.method ?? "GET";
  const body = payload?.body;

  if (!isAllowedAdminFetchPath(pathname)) {
    console.warn("[admin-ipc] Blocked admin:fetch path:", payload?.pathname);
    return { ok: false, status: 403, error: "FORBIDDEN_PATH" };
  }

  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  return callDashboardApi(pathname, init);
}

/**
 * Registers the three admin IPC channels.
 *
 * @param {() => { access_token: string, user: object } | null} getSession
 *   Returns the current main-process session (from auth-ipc-utils).
 * @param {() => string | null} getDashboardBaseUrl
 *   Returns the base URL of the running dashboard server.
 * @param {(() => Promise<{ access_token: string, user: object } | null>) | undefined} [refreshSession]
 *   Optional: attempts a Supabase token refresh and returns the updated session.
 *   When provided, `callDashboardApi` will retry once on 401 after refreshing.
 */
function registerAdminIpc(getSession, getDashboardBaseUrl, refreshSession) {
  if (typeof getSession !== "function") {
    throw new Error("[admin-ipc] registerAdminIpc requires a getSession function.");
  }
  if (typeof getDashboardBaseUrl !== "function") {
    throw new Error(
      "[admin-ipc] registerAdminIpc requires a getDashboardBaseUrl function.",
    );
  }

  _getSession = getSession;
  _getDashboardBaseUrl = getDashboardBaseUrl;
  _refreshSession = typeof refreshSession === "function" ? refreshSession : null;

  ipcMain.handle("admin:publish-template", handleAdminPublishTemplate);
  ipcMain.handle("admin:ref-data", handleAdminRefData);
  ipcMain.handle("admin:provision-license", handleAdminProvisionLicense);
  ipcMain.handle("admin:template-metadata", handleAdminTemplateMetadata);
  ipcMain.handle("admin:fetch", handleAdminFetch);
}

module.exports = { registerAdminIpc, callDashboardApi };
