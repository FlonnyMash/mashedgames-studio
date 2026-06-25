const DEFAULT_DASHBOARD_ORIGIN = "http://localhost:3000";

export function getDashboardOrigin(): string | undefined {
  const envOrigin = import.meta.env.VITE_DASHBOARD_ORIGIN;
  if (typeof envOrigin === "string" && envOrigin.length > 0) {
    return envOrigin;
  }
  return undefined;
}

export function getParentTargetOrigin(): string {
  if (window.parent !== window) {
    try {
      if (window.parent.location.origin === window.location.origin) {
        return window.location.origin;
      }
    } catch {
      // Cross-origin parent — fall through to referrer / configured origin.
    }
  }

  if (document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      // fall through
    }
  }
  return getDashboardOrigin() ?? "*";
}

function isLocalDashboardHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function isAllowedDashboardOrigin(origin: string): boolean {
  // Standalone demo bundles host React UI + engine on the same origin (e.g. *.pages.dev).
  if (origin === window.location.origin) {
    return true;
  }

  const configured = getDashboardOrigin();
  if (configured) return origin === configured;

  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    if (import.meta.env.DEV) {
      return (
        isLocalDashboardHost(url.hostname) ||
        origin === DEFAULT_DASHBOARD_ORIGIN
      );
    }
    return isLocalDashboardHost(url.hostname);
  } catch {
    return false;
  }
}
