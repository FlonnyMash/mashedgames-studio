"use client";

import { adminApiFetch, isElectronRuntime } from "@/lib/admin-api-client";
import { getAuthStatusViaIpc } from "@/lib/auth-ipc";
import { supabase } from "@/lib/supabaseClient";
import type { EnrichedTemplate } from "@/components/store/storefront-types";

type StoreTemplateDetailResponse =
  | {
      ok: true;
      template: EnrichedTemplate;
      isAdminPreview: boolean;
      isDraft: boolean;
    }
  | { ok: false; error: string; status?: number };

export async function fetchStoreTemplateDetail(
  slug: string,
): Promise<StoreTemplateDetailResponse> {
  const pathname = `/api/store/templates/${encodeURIComponent(slug)}`;

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

    const result = (await electron.ipcRenderer.invoke("admin:fetch", {
      pathname,
      method: "GET",
    })) as StoreTemplateDetailResponse;

    return result?.ok
      ? result
      : { ok: false, error: result?.error ?? "Failed to load template." };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, error: "Not signed in.", status: 401 };
  }

  const response = await fetch(pathname, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const json = (await response.json()) as StoreTemplateDetailResponse;
  if (!response.ok || !json.ok) {
    return {
      ok: false,
      error: json.ok ? `HTTP ${response.status}` : json.error,
      status: response.status,
    };
  }

  return json;
}
