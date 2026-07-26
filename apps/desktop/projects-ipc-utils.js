const { ipcMain } = require("electron");
const { callDashboardApi } = require("./admin-ipc-utils");

// Renderer-proxied dashboard API surface. `games` routes (claim, webhook
// settings/test, and the owner-scoped game list) are authenticated and
// RLS-scoped server-side, and the renderer's anon Supabase client cannot reach
// public.games directly in Electron, so they must be reachable via this proxy.
const PROJECTS_API_PATH = /^\/api\/(?:projects|games)(?:\/|$)/;

/**
 * Splits a fetch URL into pathname (for allowlist checks) and full path+query
 * (for the upstream dashboard request). Query strings must be preserved —
 * e.g. `/api/projects?mode=configurator`.
 *
 * @param {unknown} pathname
 * @returns {{ path: string, requestPath: string }}
 */
function splitProjectsFetchUrl(pathname) {
  if (typeof pathname !== "string") {
    return { path: "", requestPath: "" };
  }

  let normalized = pathname.trim();
  if (!normalized) {
    return { path: "", requestPath: "" };
  }

  let search = "";

  if (normalized.includes("://")) {
    try {
      const url = new URL(normalized);
      normalized = url.pathname;
      search = url.search;
    } catch {
      return { path: "", requestPath: "" };
    }
  } else {
    const hashIndex = normalized.indexOf("#");
    if (hashIndex >= 0) {
      normalized = normalized.slice(0, hashIndex);
    }
    const queryIndex = normalized.indexOf("?");
    if (queryIndex >= 0) {
      search = normalized.slice(queryIndex);
      normalized = normalized.slice(0, queryIndex);
    }
  }

  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return {
    path: normalized,
    requestPath: `${normalized}${search}`,
  };
}

function isAllowedProjectsFetchPath(pathname) {
  const { path } = splitProjectsFetchUrl(pathname);
  return PROJECTS_API_PATH.test(path);
}

async function handleProjectsApiFetch(_event, payload) {
  const { path, requestPath } = splitProjectsFetchUrl(payload?.pathname);
  const method = payload?.method ?? "GET";
  const body = payload?.body;

  if (!PROJECTS_API_PATH.test(path)) {
    console.warn("[projects-ipc] Blocked projects:api-fetch path:", payload?.pathname);
    return { ok: false, status: 403, error: "FORBIDDEN_PATH" };
  }

  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  return callDashboardApi(requestPath, init);
}

async function handleProjectsCreate(_event, payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, status: 400, error: "Invalid payload." };
  }

  const displayName =
    typeof payload.displayName === "string" ? payload.displayName.trim() : "";
  const parentTemplateId =
    typeof payload.parentTemplateId === "string"
      ? payload.parentTemplateId.trim()
      : "";

  if (!displayName || !parentTemplateId) {
    return { ok: false, status: 400, error: "displayName and parentTemplateId are required." };
  }

  const formData = new FormData();
  formData.append("displayName", displayName);
  formData.append("parentTemplateId", parentTemplateId);

  if (typeof payload.clientName === "string" && payload.clientName.trim()) {
    formData.append("clientName", payload.clientName.trim());
  }

  if (
    payload.clientLogo &&
    typeof payload.clientLogo === "object" &&
    typeof payload.clientLogo.data === "string" &&
    typeof payload.clientLogo.fileName === "string"
  ) {
    const buffer = Buffer.from(payload.clientLogo.data, "base64");
    formData.append(
      "clientLogo",
      new Blob([buffer]),
      payload.clientLogo.fileName,
    );
  }

  return callDashboardApi("/api/projects/create", {
    method: "POST",
    body: formData,
  });
}

function registerProjectsIpc() {
  ipcMain.handle("projects:api-fetch", handleProjectsApiFetch);
  ipcMain.handle("projects:create", handleProjectsCreate);
}

module.exports = { registerProjectsIpc, splitProjectsFetchUrl, isAllowedProjectsFetchPath };
