/** Default template id for desktop runtime. */
export const DESKTOP_BUNDLED_TEMPLATE_ID = "default";

function readEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    const direct = process.env[key as keyof NodeJS.ProcessEnv];
    if (typeof direct === "string") {
      return direct;
    }
  }

  // Vite demo-shell / game-engine bundles inline import.meta.env at build time.
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> })
      .env;
    if (!env) {
      return undefined;
    }
    if (key === "NODE_ENV") {
      if (env.PROD === true) {
        return "production";
      }
      if (env.DEV === true) {
        return "development";
      }
      if (typeof env.MODE === "string") {
        return env.MODE;
      }
    }
    const vitePublicKey = key.startsWith("NEXT_PUBLIC_")
      ? `VITE_${key.slice("NEXT_PUBLIC_".length)}`
      : key;
    const candidate = env[vitePublicKey] ?? env[key];
    return typeof candidate === "string" ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function isProductionEnv(): boolean {
  if (typeof process !== "undefined" && process.env?.NODE_ENV) {
    return process.env.NODE_ENV === "production";
  }
  try {
    return (
      (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD ===
      true
    );
  } catch {
    return false;
  }
}

function isDevelopmentEnv(): boolean {
  if (typeof process !== "undefined" && process.env?.NODE_ENV) {
    return process.env.NODE_ENV === "development";
  }
  try {
    return (
      (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true
    );
  } catch {
    return false;
  }
}

function hasElectronPreload(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const candidate = window as Window & {
    electron?: { ipcRenderer?: unknown };
  };
  return Boolean(candidate.electron?.ipcRenderer);
}

function isDesktopRuntime(): boolean {
  if (readEnv("NEXT_PUBLIC_WORKSPACE_DESKTOP") === "1") {
    return true;
  }
  return hasElectronPreload();
}

export function getDesktopBundledTemplateIds(): string[] | null {
  if (!isDesktopRuntime()) {
    return null;
  }

  const raw = readEnv("NEXT_PUBLIC_BUNDLED_TEMPLATES")?.trim();
  if (!raw) {
    return [DESKTOP_BUNDLED_TEMPLATE_ID];
  }

  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Base URL for static game-engine assets embedded under `/engine`.
 */
export function resolveGameEngineBaseUrl(): string {
  const devUrlRaw = readEnv("NEXT_PUBLIC_GAME_ENGINE_URL");
  const devUrl = (devUrlRaw ?? "http://localhost:5173").replace(/\/$/, "");

  // Next.js dev always uses the cross-origin Vite server — never embedded /engine.
  if (isDevelopmentEnv()) {
    if (typeof window !== "undefined") {
      return devUrl;
    }
    return devUrl;
  }

  const useEmbeddedEngine =
    isDesktopRuntime() || isProductionEnv() || devUrl === "/engine";

  if (typeof window !== "undefined") {
    if (useEmbeddedEngine) {
      return `${window.location.origin}/engine`;
    }
    return devUrl;
  }

  if (useEmbeddedEngine) {
    return "/engine";
  }

  return devUrl;
}

export function resolveTemplatePreviewUrl(
  previewUrl: string,
  options?: { cacheBust?: number },
): string {
  const path = previewUrl.startsWith("/") ? previewUrl : `/${previewUrl}`;
  const url = `${resolveGameEngineBaseUrl()}${path}`;
  return options?.cacheBust ? `${url}?t=${options.cacheBust}` : url;
}

/** Resolves a persisted asset string to a URL suitable for sidebar img previews. */
export function resolveControlAssetPreviewSrc(
  assetUrl: string | null | undefined,
): string | null {
  if (!assetUrl || assetUrl.trim() === "") {
    return null;
  }

  const trimmed = assetUrl.trim();
  if (trimmed.startsWith("data:")) {
    return null;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("mashedgames-studio://")) {
    return null;
  }
  if (trimmed.startsWith("/")) {
    return resolveTemplatePreviewUrl(trimmed);
  }
  if (trimmed.startsWith("assets/")) {
    return null;
  }

  return resolveTemplatePreviewUrl(`/${trimmed.replace(/^\//, "")}`);
}
