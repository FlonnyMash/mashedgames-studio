const { ipcMain } = require("electron");
const { callDashboardApi } = require("./admin-ipc-utils");

const PROJECTS_API_PATH = /^\/api\/projects(?:\/|$)/;

function normalizeProjectsFetchPathname(pathname) {
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

function isAllowedProjectsFetchPath(pathname) {
  const normalized = normalizeProjectsFetchPathname(pathname);
  return PROJECTS_API_PATH.test(normalized);
}

async function handleProjectsApiFetch(_event, payload) {
  const pathname = normalizeProjectsFetchPathname(payload?.pathname);
  const method = payload?.method ?? "GET";
  const body = payload?.body;

  if (!isAllowedProjectsFetchPath(pathname)) {
    console.warn("[projects-ipc] Blocked projects:api-fetch path:", payload?.pathname);
    return { ok: false, status: 403, error: "FORBIDDEN_PATH" };
  }

  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  return callDashboardApi(pathname, init);
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

module.exports = { registerProjectsIpc };
