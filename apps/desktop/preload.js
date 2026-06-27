const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED_CHANNELS = new Set([
  "save-project-asset",
  "export-project",
  "save-flat-config",
  "load-flat-config",
  "get-project-list",
  "auth:login",
  "auth:logout",
  "auth:get-status",
  "auth:get-profile",
  "admin:publish-template",
  "admin:ref-data",
  "admin:provision-license",
  "admin:template-metadata",
  "admin:fetch",
  "license:check-eligibility",
  "store:load-catalog",
  "store:load-tag-filters",
  "store:acquire-license",
  "store:claim-game",
  // Electron auto-updater
  "updater:check",
  "updater:download",
  "updater:quit-and-install",
  // Game template OTA updates
  "template:check-version",
  "template:get-installed-version",
  "template:install",
]);

// Push channels that the renderer may subscribe to via ipcRenderer.on().
// Only channels in this set may be listened to from renderer code.
const ALLOWED_PUSH_CHANNELS = new Set([
  "updater:status",
  "template:install-progress",
]);

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke(channel, payload) {
      if (!ALLOWED_CHANNELS.has(channel)) {
        return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
      }
      return ipcRenderer.invoke(channel, payload);
    },

    /**
     * Subscribes to push events from the main process.
     * Only channels in ALLOWED_PUSH_CHANNELS may be subscribed to.
     *
     * @param {string} channel
     * @param {(...args: unknown[]) => void} listener
     */
    on(channel, listener) {
      if (!ALLOWED_PUSH_CHANNELS.has(channel)) {
        console.warn(`[preload] ipcRenderer.on — channel not allowed: ${channel}`);
        return;
      }
      ipcRenderer.on(channel, listener);
    },

    /**
     * Removes a previously registered push listener.
     *
     * @param {string} channel
     * @param {(...args: unknown[]) => void} listener
     */
    removeListener(channel, listener) {
      if (!ALLOWED_PUSH_CHANNELS.has(channel)) return;
      ipcRenderer.removeListener(channel, listener);
    },
  },
});

// The dev-store-preview flag may arrive via two channels:
//  1. process.env  — set at OS level or inherited from main-process env at
//                    renderer-process spawn time.
//  2. process.argv — injected via BrowserWindow.webPreferences.additionalArguments
//                    by main.js after loadDevRuntimeOverride() runs; this is the
//                    reliable path for packaged builds where env mutations in
//                    the main process are not guaranteed to propagate to the
//                    renderer subprocess.
const devStorePreviewActive =
  process.env.MASHEDGAMES_DEV_STORE_PREVIEW === "1" ||
  process.argv.includes("--mashed-dev-store-preview");

contextBridge.exposeInMainWorld("mashedRuntime", {
  devStorePreview: devStorePreviewActive,
  usesExternalDashboard: Boolean(process.env.MASHEDGAMES_DASHBOARD_URL?.trim()),
});
