import { getAuthStatusViaIpc } from "@/lib/auth-ipc";
import { isElectronRuntime } from "@/lib/admin-api-client";
import { supabase } from "@/lib/supabaseClient";
import type {
  ClientProjectPayload,
  GameProjectManifest,
} from "@mashedgames/shared";

type ProjectApiResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string; status?: number };

export async function getWebAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return {};
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

function getElectronIpc() {
  return (
    window as Window & {
      electron?: {
        ipcRenderer: {
          invoke: (channel: string, payload: unknown) => Promise<unknown>;
        };
      };
    }
  ).electron?.ipcRenderer;
}

/**
 * Authenticated fetch to dashboard project API routes.
 * - Web: Bearer token from supabase.auth.getSession()
 * - Electron: proxied via main process (tokens never enter renderer)
 */
export async function projectApiFetch<T extends Record<string, unknown>>(
  pathname: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ProjectApiResult<T>> {
  if (isElectronRuntime()) {
    const electron = getElectronIpc();
    if (!electron) {
      return { ok: false, error: "Electron IPC unavailable." };
    }

    try {
      const result = (await electron.invoke("projects:api-fetch", {
        pathname,
        method: init.method ?? "GET",
        body: init.body,
      })) as ProjectApiResult<T> & { status?: number };

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

  const headers: Record<string, string> = {
    ...(await getWebAuthHeaders()),
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

  const json = (await response.json()) as ProjectApiResult<T>;
  if (!response.ok || !json.ok) {
    return {
      ok: false,
      error: json.ok ? `HTTP ${response.status}` : json.error,
      status: response.status,
    };
  }

  return json;
}

/**
 * Drop-in fetch wrapper for project API routes with auth headers.
 * Electron JSON requests are proxied through IPC.
 */
export async function projectFetch(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  if (isElectronRuntime()) {
    let body: unknown;
    if (typeof init.body === "string" && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = undefined;
      }
    }

    const result = await projectApiFetch(pathname, {
      method: init.method ?? "GET",
      body,
    });

    const status = result.ok ? 200 : (result.status ?? 500);
    return new Response(JSON.stringify(result), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = {
    ...(init.headers as Record<string, string> | undefined),
    ...(await getWebAuthHeaders()),
  };

  return fetch(pathname, { ...init, headers });
}

export async function createProjectViaApi(input: {
  displayName: string;
  parentTemplateId: string;
  clientName?: string;
  clientLogo?: File;
}): Promise<
  ProjectApiResult<{
    projectId: string;
    manifest: GameProjectManifest;
    client: ClientProjectPayload;
  }>
> {
  if (isElectronRuntime()) {
    const electron = getElectronIpc();
    if (!electron) {
      return { ok: false, error: "Electron IPC unavailable." };
    }

    const auth = await getAuthStatusViaIpc();
    if (!auth?.isAuthenticated) {
      return { ok: false, error: "Authentication required.", status: 401 };
    }

    let clientLogo:
      | {
          data: string;
          fileName: string;
        }
      | undefined;

    if (input.clientLogo) {
      const buffer = await input.clientLogo.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index]!);
      }
      clientLogo = {
        data: btoa(binary),
        fileName: input.clientLogo.name,
      };
    }

    try {
      const result = (await electron.invoke("projects:create", {
        displayName: input.displayName,
        parentTemplateId: input.parentTemplateId,
        clientName: input.clientName,
        clientLogo,
      })) as ProjectApiResult<{
        projectId: string;
        manifest: GameProjectManifest;
        client: ClientProjectPayload;
      }>;

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

  if (input.clientLogo) {
    const formData = new FormData();
    formData.append("displayName", input.displayName);
    formData.append("parentTemplateId", input.parentTemplateId);
    if (input.clientName?.trim()) {
      formData.append("clientName", input.clientName.trim());
    }
    formData.append("clientLogo", input.clientLogo);

    const headers = await getWebAuthHeaders();
    const response = await fetch("/api/projects/create", {
      method: "POST",
      headers,
      body: formData,
    });
    const json = (await response.json()) as ProjectApiResult<{
      projectId: string;
      manifest: GameProjectManifest;
      client: ClientProjectPayload;
    }>;
    if (!response.ok || !json.ok) {
      return {
        ok: false,
        error: json.ok ? `HTTP ${response.status}` : json.error,
        status: response.status,
      };
    }
    return json;
  }

  return projectApiFetch("/api/projects/create", {
    method: "POST",
    body: {
      displayName: input.displayName,
      parentTemplateId: input.parentTemplateId,
      clientName: input.clientName,
    },
  });
}
