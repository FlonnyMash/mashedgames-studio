"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getAdminRefDataViaIpc, publishTemplateViaIpc } from "@/lib/auth-ipc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tier = "free" | "premium" | "enterprise";

type LocalTemplate = {
  id: string;
  displayName: string;
  status: string;
};

type PublishedVersion = {
  version: string;
  publishedAt: string;
};

type TemplateState =
  | { status: "idle"; publishedVersion: PublishedVersion | null }
  | { status: "publishing" }
  | { status: "done"; version: string };

type ListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; templates: LocalTemplate[] };

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "premium", label: "Premium" },
  { value: "enterprise", label: "Enterprise" },
];

const TIER_COLORS: Record<Tier, string> = {
  free: "bg-zinc-100 text-zinc-600",
  premium: "bg-amber-50 text-amber-700 border border-amber-200",
  enterprise: "bg-violet-50 text-violet-700 border border-violet-200",
};

function isElectronRuntime() {
  return (
    typeof window !== "undefined" &&
    !!(window as Window & { electron?: { ipcRenderer?: unknown } }).electron
      ?.ipcRenderer
  );
}

// ---------------------------------------------------------------------------
// PublishTemplatePanel
// ---------------------------------------------------------------------------

export function PublishTemplatePanel() {
  const [listState, setListState] = useState<ListState>({ status: "loading" });
  const [publishedVersions, setPublishedVersions] = useState<
    Record<string, PublishedVersion>
  >({});
  const [tierSelections, setTierSelections] = useState<Record<string, Tier>>(
    {},
  );
  const [templateStates, setTemplateStates] = useState<
    Record<string, TemplateState>
  >({});

  const fetchTemplates = useCallback(async () => {
    setListState({ status: "loading" });
    try {
      const res = await fetch("/api/templates");
      const data = (await res.json()) as {
        ok?: boolean;
        templates?: LocalTemplate[];
      };
      if (!res.ok || !data.ok || !data.templates) {
        setListState({ status: "error" });
        return;
      }
      setListState({ status: "success", templates: data.templates });
    } catch {
      setListState({ status: "error" });
    }
  }, []);

  const fetchPublishedVersions = useCallback(async () => {
    try {
      if (isElectronRuntime()) {
        const body = await getAdminRefDataViaIpc();
        if (body?.ok) {
          const versionMap: Record<string, PublishedVersion> = {};
          for (const tpl of body.templates) {
            const published = {
              version: "published",
              publishedAt: "",
            };
            // `template_slug` maps to local template IDs; keep `id` too as a
            // defensive fallback if future payloads switch identifiers.
            versionMap[tpl.template_slug] = published;
            versionMap[tpl.id] = published;
          }
          setPublishedVersions(versionMap);
          return;
        }

        // If Electron bridge exists but admin IPC handlers are not registered
        // yet, fall back to web fetch path below instead of hard failing.
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch("/api/admin/ref-data", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;

      const body = (await res.json()) as
        | { ok: true; templates: { id: string; template_slug: string }[] }
        | { ok: false };
      if (!body.ok) return;

      // Build a map of slug → latest published version info
      // (ref-data only returns slug+id; we use it to know what's published)
      const versionMap: Record<string, PublishedVersion> = {};
      for (const tpl of body.templates) {
        const published = {
          version: "published",
          publishedAt: "",
        };
        versionMap[tpl.template_slug] = published;
        versionMap[tpl.id] = published;
      }
      setPublishedVersions(versionMap);
    } catch {
      // Non-fatal — published versions are a nice-to-have indicator
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchPublishedVersions();
  }, [fetchTemplates, fetchPublishedVersions]);

  const handlePublish = useCallback(
    async (templateId: string) => {
      setTemplateStates((prev) => ({
        ...prev,
        [templateId]: { status: "publishing" },
      }));

      if (isElectronRuntime()) {
        const tier: Tier = tierSelections[templateId] ?? "free";
        const body = await publishTemplateViaIpc({ templateId, tier });

        if (body !== null) {
          // IPC bridge responded — use its result regardless of success/failure.
          // Never fall through: the bridge is functional, so any failure is real.
          if (body.ok) {
            const newVersion: PublishedVersion = {
              version: body.version,
              publishedAt: new Date().toISOString(),
            };

            setPublishedVersions((prev) => ({ ...prev, [templateId]: newVersion }));
            setTemplateStates((prev) => ({
              ...prev,
              [templateId]: { status: "done", version: body.version },
            }));

            toast.success(`Template published`, {
              description: `${templateId} v${body.version} is now live.`,
            });

            setTimeout(() => {
              setTemplateStates((prev) => ({
                ...prev,
                [templateId]: { status: "idle", publishedVersion: newVersion },
              }));
            }, 3000);
            return;
          }

          // IPC bridge returned a failure — map the error code to a readable message.
          const IPC_ERROR_MESSAGES: Record<string, string> = {
            SESSION_EXPIRED:
              "Your session has expired. Please sign out and sign in again.",
            DASHBOARD_NOT_READY:
              "The dashboard server is not ready yet. Wait a moment and try again.",
            ADMIN_IPC_NOT_INITIALIZED:
              "Admin IPC not initialised. Restart the app and try again.",
          };
          const ipcMsg =
            IPC_ERROR_MESSAGES[body.error] ??
            body.error ??
            "Publish failed via desktop bridge.";

          toast.error("Publish failed", { description: ipcMsg });
          setTemplateStates((prev) => ({
            ...prev,
            [templateId]: {
              status: "idle",
              publishedVersion: publishedVersions[templateId] ?? null,
            },
          }));
          return;
        }

        // body === null: IPC channel is not registered in this Electron build
        // (missing handler / channel not in allowlist). Fall through to the
        // web-session path so the admin panel still works in dev mode where
        // the renderer has a live Supabase browser session.
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error("Session expired. Please sign in again.");
        setTemplateStates((prev) => ({
          ...prev,
          [templateId]: {
            status: "idle",
            publishedVersion: publishedVersions[templateId] ?? null,
          },
        }));
        return;
      }

      const tier: Tier = tierSelections[templateId] ?? "free";

      let res: Response;
      try {
        res = await fetch("/api/admin/publish-template", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ templateId, tier }),
        });
      } catch {
        toast.error("Network error. Check your connection.");
        setTemplateStates((prev) => ({
          ...prev,
          [templateId]: {
            status: "idle",
            publishedVersion: publishedVersions[templateId] ?? null,
          },
        }));
        return;
      }

      const body = (await res.json()) as
        | { ok: true; version: string; templateRowId: string }
        | { ok: false; error: string };

      if (!res.ok || !body.ok) {
        const msg = body.ok === false ? body.error : `HTTP ${res.status}`;
        toast.error("Publish failed", { description: msg });
        setTemplateStates((prev) => ({
          ...prev,
          [templateId]: {
            status: "idle",
            publishedVersion: publishedVersions[templateId] ?? null,
          },
        }));
        return;
      }

      const newVersion: PublishedVersion = {
        version: body.version,
        publishedAt: new Date().toISOString(),
      };

      setPublishedVersions((prev) => ({ ...prev, [templateId]: newVersion }));
      setTemplateStates((prev) => ({
        ...prev,
        [templateId]: { status: "done", version: body.version },
      }));

      toast.success(`Template published`, {
        description: `${templateId} v${body.version} is now live.`,
      });

      // Reset "done" back to "idle" after 3 s
      setTimeout(() => {
        setTemplateStates((prev) => ({
          ...prev,
          [templateId]: { status: "idle", publishedVersion: newVersion },
        }));
      }, 3000);
    },
    [tierSelections, publishedVersions],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">
            Publish Templates
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Package a local template and register it in Supabase DRM.
          </p>
        </div>
        {listState.status !== "loading" ? (
          <button
            type="button"
            onClick={() => {
              fetchTemplates();
              fetchPublishedVersions();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
            aria-label="Refresh template list"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="px-6 py-5">
        {listState.status === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading templates…
          </div>
        ) : listState.status === "error" ? (
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <span>Failed to load templates.</span>
            <button
              type="button"
              onClick={fetchTemplates}
              className="ml-3 text-xs font-medium underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : listState.templates.length === 0 ? (
          <p className="text-sm text-zinc-400">No local templates found.</p>
        ) : (
          <ul className="space-y-3">
            {listState.templates.map((template) => {
              const state = templateStates[template.id] ?? {
                status: "idle",
                publishedVersion: publishedVersions[template.id] ?? null,
              };
              const selectedTier: Tier =
                tierSelections[template.id] ?? "free";
              const isPublishing = state.status === "publishing";
              const isDone = state.status === "done";
              const publishedVersion =
                state.status === "idle" ? state.publishedVersion : null;

              return (
                <li
                  key={template.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  {/* Template identity */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {template.displayName}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-zinc-400">
                        {template.id}
                      </p>
                    </div>
                    {publishedVersion ? (
                      <span className="shrink-0 rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
                        published
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                        unpublished
      </span>
                    )}
                  </div>

                  {/* Tier selector + Publish button */}
                  <div className="mt-3 flex items-center gap-2">
                    <select
                      value={selectedTier}
                      onChange={(e) =>
                        setTierSelections((prev) => ({
                          ...prev,
                          [template.id]: e.target.value as Tier,
                        }))
                      }
                      disabled={isPublishing}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none transition-colors focus:border-zinc-400 disabled:opacity-50"
                    >
                      {TIER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {/* Tier pill */}
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${TIER_COLORS[selectedTier]}`}
                    >
                      {selectedTier}
                    </span>

                    <button
                      type="button"
                      onClick={() => handlePublish(template.id)}
                      disabled={isPublishing || isDone}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPublishing ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Publishing…
                        </>
                      ) : isDone ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Published
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-3 w-3" />
                          {publishedVersion ? "Re-publish" : "Publish"}
                        </>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-xs text-zinc-400">
          Requires a{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-zinc-600">
            template-bundles
          </code>{" "}
          bucket in Supabase Storage and{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-zinc-600">
            GRANT INSERT, UPDATE ON public.templates TO service_role;
          </code>
        </p>
      </div>
    </div>
  );
}
