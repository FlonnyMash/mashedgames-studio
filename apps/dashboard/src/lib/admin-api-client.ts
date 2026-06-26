import { getAuthStatusViaIpc } from "@/lib/auth-ipc";
import { supabase } from "@/lib/supabaseClient";

export function isElectronRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as Window & { electron?: { ipcRenderer?: unknown } }).electron
      ?.ipcRenderer
  );
}

type AdminFetchInit = {
  method?: string;
  body?: unknown;
};

type AdminFetchResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string; status?: number };

/**
 * Authenticated fetch to dashboard admin/template tag API routes.
 * - Web: Bearer token from supabase.auth.getSession()
 * - Electron: proxied via main process (tokens never enter renderer)
 */
export async function adminApiFetch<T extends Record<string, unknown>>(
  pathname: string,
  init: AdminFetchInit = {},
): Promise<AdminFetchResult<T>> {
  if (isElectronRuntime()) {
    const electron = (
      window as Window & {
        electron?: {
          ipcRenderer: {
            invoke: (channel: string, payload: unknown) => Promise<unknown>;
          };
        };
      }
    ).electron;

    if (!electron?.ipcRenderer) {
      return { ok: false, error: "Electron IPC unavailable." };
    }

    const auth = await getAuthStatusViaIpc();
    if (!auth?.isAuthenticated) {
      return { ok: false, error: "Not signed in.", status: 401 };
    }

    try {
      const result = (await electron.ipcRenderer.invoke("admin:fetch", {
        pathname,
        method: init.method ?? "GET",
        body: init.body,
      })) as AdminFetchResult<T> & { status?: number };

      if (!result || typeof result !== "object") {
        return { ok: false, error: "Invalid IPC response." };
      }

      return result;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "IPC request failed.",
      };
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, error: "Not signed in.", status: 401 };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };

  let body: string | undefined;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  let response: Response;
  try {
    response = await fetch(pathname, {
      method: init.method ?? "GET",
      headers,
      body,
    });
  } catch {
    return { ok: false, error: "Network request failed." };
  }

  const json = (await response.json()) as AdminFetchResult<T>;
  if (!response.ok || !json.ok) {
    return {
      ok: false,
      error: json.ok ? `HTTP ${response.status}` : json.error,
      status: response.status,
    };
  }

  return json;
}
