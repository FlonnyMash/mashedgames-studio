/** Auth IPC response shape returned by all three channels. */
export type AuthStatus = {
  isAuthenticated: boolean;
  email: string | null;
  userId: string | null;
  error?: string;
};

/**
 * Response shape for the `auth:get-profile` IPC channel.
 *
 * On success, `profile.role` is the user's role from `public.profiles`
 * and `profile.org` is the joined `organizations` row (or null if the user
 * has no organisation).  On failure, `error` carries the raw error message
 * from the main process so the UI can surface it.
 */
export type ProfileResult =
  | {
      ok: true;
      profile: {
        role: string | null;
        org: { name: string; plan: string } | null;
      };
    }
  | { ok: false; error: string };

/**
 * Returns the Electron ipcRenderer bridge, or null when running in a browser
 * dev context where window.electron is not present.
 *
 * Auth IPC is intentionally non-throwing in the web context — the dashboard
 * renders with isAuthenticated: false so layout/UI can be developed offline
 * without a running Electron shell.
 */
function getElectron() {
  return window.electron?.ipcRenderer ?? null;
}

function isMissingIpcHandlerError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return (
    msg.includes("No handler registered for") || msg.includes("IPC channel not allowed")
  );
}

/**
 * Authenticates the user via Supabase in the Electron main process.
 * The main process encrypts the resulting session tokens with safeStorage
 * and holds them in memory. Access/refresh tokens are never returned here.
 *
 * Returns null when called outside the Electron runtime (web dev context).
 */
export async function loginViaIpc(
  email: string,
  password: string,
): Promise<AuthStatus | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return await electron.invoke("auth:login", { email, password });
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}

/**
 * Signs out the current user in the Electron main process, clears the
 * in-memory session, and deletes the encrypted token file from disk.
 *
 * Returns null when called outside the Electron runtime.
 */
export async function logoutViaIpc(): Promise<AuthStatus | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return await electron.invoke("auth:logout");
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}

/**
 * Queries the current authentication state from the Electron main process.
 * Safe to call on every app boot — the main process has already restored any
 * persisted session before the renderer window is created.
 *
 * Returns null when called outside the Electron runtime.
 */
export async function getAuthStatusViaIpc(): Promise<AuthStatus | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return await electron.invoke("auth:get-status");
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}

/**
 * Fetches the current user's profile (role + organisation) from the Electron
 * main process.  The main process uses its in-memory JWT to run an
 * authenticated Supabase query, satisfying RLS without ever sending the token
 * to the renderer.
 *
 * Returns null when called outside the Electron runtime (web dev context).
 */
export async function getProfileViaIpc(): Promise<ProfileResult | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return await electron.invoke("auth:get-profile");
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}

/**
 * Instructs the Electron main process to wipe its persisted session tokens
 * (in-memory session + safeStorage file) without requiring a full sign-out
 * round-trip from the renderer.
 *
 * Use this on the web auth path when `supabase.auth.signOut()` has already
 * been called in the renderer and the Electron layer just needs to clean up
 * its side of the session.
 *
 * Falls back to `auth:logout` because it performs the same token wipe. If the
 * main process adds a dedicated `auth:wipe-tokens` channel in the future,
 * swap the channel name here without changing callers.
 *
 * Returns null (no-op) when called outside the Electron runtime.
 */
export async function wipePersistedTokensViaIpc(): Promise<AuthStatus | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return await electron.invoke("auth:logout");
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}

type AdminRefDataResult =
  | {
      ok: true;
      orgs: { id: string; name: string }[];
      templates: { id: string; template_slug: string }[];
    }
  | { ok: false; error: string };

type AdminPublishTemplateResult =
  | { ok: true; version: string; templateRowId: string }
  | { ok: false; error: string };

type AdminProvisionLicenseResult =
  | { ok: true; licenseId: string }
  | { ok: false; error: string };

export async function getAdminRefDataViaIpc(): Promise<AdminRefDataResult | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return await electron.invoke("admin:ref-data");
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}

export async function publishTemplateViaIpc(payload: {
  templateId: string;
  tier: "free" | "premium" | "enterprise";
  demo_url?: string;
}): Promise<AdminPublishTemplateResult | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return await electron.invoke("admin:publish-template", payload);
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}

export async function provisionLicenseViaIpc(payload: {
  org_id: string;
  template_id: string;
  max_projects: number;
  valid_until: string | null;
}): Promise<AdminProvisionLicenseResult | null> {
  const electron = getElectron();
  if (!electron) return null;
  try {
    return await electron.invoke("admin:provision-license", payload);
  } catch (err) {
    if (isMissingIpcHandlerError(err)) return null;
    throw err;
  }
}
