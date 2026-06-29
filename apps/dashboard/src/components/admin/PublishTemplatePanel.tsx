"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getAdminRefDataViaIpc, publishTemplateViaIpc } from "@/lib/auth-ipc";
import {
  PublishTemplateDetailsDialog,
  type PublishedVersion,
  type Tier,
} from "@/components/admin/PublishTemplateDetailsDialog";
import { parseAdminTemplateTab } from "@/lib/storefront-editor-routes";

type LocalTemplate = {
  id: string;
  displayName: string;
  status: string;
};

type TemplateState =
  | { status: "idle"; publishedVersion: PublishedVersion | null }
  | { status: "publishing" }
  | { status: "done"; version: string };

type ListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; templates: LocalTemplate[] };

function isElectronRuntime() {
  return (
    typeof window !== "undefined" &&
    !!(window as Window & { electron?: { ipcRenderer?: unknown } }).electron
      ?.ipcRenderer
  );
}

function buildPublishPayload(
  templateId: string,
  tier: Tier,
  demoUrls: Record<string, string>,
): { templateId: string; tier: Tier; demo_url?: string } {
  const payload: { templateId: string; tier: Tier; demo_url?: string } = {
    templateId,
    tier,
  };
  if (templateId in demoUrls) {
    payload.demo_url = demoUrls[templateId]?.trim() ?? "";
  }
  return payload;
}

const PublishTemplateListRow = memo(function PublishTemplateListRow({
  displayName,
  isPublished,
  onSelect,
}: {
  displayName: string;
  isPublished: boolean;
  onSelect: () => void;
}) {
  return (
    <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900"
      >
        <span className="truncate text-sm font-medium text-zinc-900">
          {displayName}
        </span>
        {isPublished ? (
          <span className="shrink-0 rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
            Published
          </span>
        ) : (
          <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
            Unpublished
          </span>
        )}
      </button>
  );
});

export function PublishTemplatePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [listState, setListState] = useState<ListState>({ status: "loading" });
  const [publishedVersions, setPublishedVersions] = useState<
    Record<string, PublishedVersion>
  >({});
  const [tierSelections, setTierSelections] = useState<Record<string, Tier>>(
    {},
  );
  const [demoUrls, setDemoUrls] = useState<Record<string, string>>({});
  const [templateStates, setTemplateStates] = useState<
    Record<string, TemplateState>
  >({});
  const [deployingTemplates, setDeployingTemplates] = useState<Set<string>>(
    new Set(),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );

  const adminTemplateParam = searchParams.get("template");
  const adminTabParam = parseAdminTemplateTab(searchParams.get("tab"));

  const urlSelectedTemplateId = useMemo(() => {
    if (listState.status !== "success" || !adminTemplateParam) return null;
    return listState.templates.some((t) => t.id === adminTemplateParam)
      ? adminTemplateParam
      : null;
  }, [adminTemplateParam, listState]);

  const resolvedSelectedTemplateId = selectedTemplateId ?? urlSelectedTemplateId;

  const selectedTemplate = useMemo(() => {
    if (listState.status !== "success" || !resolvedSelectedTemplateId) return null;
    return (
      listState.templates.find((t) => t.id === resolvedSelectedTemplateId) ?? null
    );
  }, [listState, resolvedSelectedTemplateId]);

  const fetchDemoUrlsFromLocalMeta = useCallback(async (templates: LocalTemplate[]) => {
    try {
      const entries = await Promise.all(
        templates.map(async (template) => {
          try {
            const res = await fetch(`/api/templates/${template.id}/meta`);
            if (!res.ok) return null;
            const body = (await res.json()) as {
              ok?: boolean;
              meta?: { demo_url?: string };
            };
            if (!body.ok || typeof body.meta?.demo_url !== "string") return null;
            const trimmed = body.meta.demo_url.trim();
            return trimmed ? ([template.id, trimmed] as const) : null;
          } catch {
            return null;
          }
        }),
      );

      const urlMap: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) {
          urlMap[entry[0]] = entry[1];
        }
      }

      if (Object.keys(urlMap).length > 0) {
        setDemoUrls((prev) => ({ ...urlMap, ...prev }));
      }
    } catch {
      // Non-fatal — demo URL inputs fall back to empty until deploy/publish.
    }
  }, []);

  const openTemplate = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("template", templateId);
      router.replace(`/admin?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closeTemplate = useCallback(() => {
    setSelectedTemplateId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("template");
    params.delete("tab");
    const query = params.toString();
    router.replace(query ? `/admin?${query}` : "/admin", { scroll: false });
  }, [router, searchParams]);

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
      void fetchDemoUrlsFromLocalMeta(data.templates);
    } catch {
      setListState({ status: "error" });
    }
  }, [fetchDemoUrlsFromLocalMeta]);

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
            versionMap[tpl.template_slug] = published;
            versionMap[tpl.id] = published;
          }
          setPublishedVersions(versionMap);
          return;
        }
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
        const body = await publishTemplateViaIpc(
          buildPublishPayload(templateId, tier, demoUrls),
        );

        if (body !== null) {
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
          body: JSON.stringify(
            buildPublishPayload(templateId, tier, demoUrls),
          ),
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

      setTimeout(() => {
        setTemplateStates((prev) => ({
          ...prev,
          [templateId]: { status: "idle", publishedVersion: newVersion },
        }));
      }, 3000);
    },
    [tierSelections, demoUrls, publishedVersions],
  );

  const handleDeployDemo = useCallback(
    async (templateId: string) => {
      if (isElectronRuntime()) {
        toast.info("Use the terminal to deploy demos from the desktop app", {
          description: `Run: pnpm deploy:demo ${templateId}`,
          duration: 8000,
        });
        return;
      }

      setDeployingTemplates((prev) => new Set([...prev, templateId]));

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          toast.error("Not signed in", {
            description: "Please sign in to the dashboard before deploying.",
          });
          return;
        }

        const res = await fetch("/api/admin/deploy-demo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ templateSlug: templateId }),
        });

        const body = (await res.json()) as
          | { ok: true; demo_url: string }
          | { ok: false; error: string };

        if (!res.ok || !body.ok) {
          const msg = body.ok === false ? body.error : `HTTP ${res.status}`;
          toast.error("Deploy failed", { description: msg });
          return;
        }

        const deployedUrl = body.demo_url.trim();
        if (!deployedUrl) {
          toast.error("Deploy failed", {
            description: "Server returned an empty demo URL.",
          });
          return;
        }

        setDemoUrls((prev) => ({ ...prev, [templateId]: deployedUrl }));

        toast.success("Demo deployed!", {
          description: `Live at ${deployedUrl}`,
        });
      } catch {
        toast.error("Network error", {
          description: "Could not reach the deploy endpoint. Check your connection.",
        });
      } finally {
        setDeployingTemplates((prev) => {
          const next = new Set(prev);
          next.delete(templateId);
          return next;
        });
      }
    },
    [],
  );

  const publishedById = useMemo(() => {
    const map: Record<string, boolean> = {};
    if (listState.status !== "success") return map;
    for (const template of listState.templates) {
      map[template.id] = Boolean(publishedVersions[template.id]);
    }
    return map;
  }, [listState, publishedVersions]);

  const selectedState = resolvedSelectedTemplateId
    ? (templateStates[resolvedSelectedTemplateId] ?? {
        status: "idle" as const,
        publishedVersion: publishedVersions[resolvedSelectedTemplateId] ?? null,
      })
    : null;

  return (
    <>
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
            <ul className="overflow-hidden rounded-lg border border-zinc-200">
              {listState.templates.map((template, index) => (
                <li
                  key={template.id}
                  className={index > 0 ? "border-t border-zinc-100" : undefined}
                >
                  <PublishTemplateListRow
                    displayName={template.displayName}
                    isPublished={publishedById[template.id] ?? false}
                    onSelect={() => openTemplate(template.id)}
                  />
                </li>
              ))}
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

      {selectedTemplate && selectedState ? (
        <PublishTemplateDetailsDialog
          templateId={selectedTemplate.id}
          displayName={selectedTemplate.displayName}
          open={Boolean(resolvedSelectedTemplateId)}
          onClose={closeTemplate}
          initialTab={
            selectedTemplate.id === adminTemplateParam ? adminTabParam : "settings"
          }
          selectedTier={tierSelections[selectedTemplate.id] ?? "free"}
          onTierChange={(tier) =>
            setTierSelections((prev) => ({
              ...prev,
              [selectedTemplate.id]: tier,
            }))
          }
          demoUrl={demoUrls[selectedTemplate.id] ?? ""}
          onDemoUrlChange={(url) =>
            setDemoUrls((prev) => ({
              ...prev,
              [selectedTemplate.id]: url,
            }))
          }
          isPublishing={selectedState.status === "publishing"}
          isDone={selectedState.status === "done"}
          isDeploying={deployingTemplates.has(selectedTemplate.id)}
          publishedVersion={
            selectedState.status === "idle"
              ? selectedState.publishedVersion
              : null
          }
          onPublish={() => void handlePublish(selectedTemplate.id)}
          onDeployDemo={() => void handleDeployDemo(selectedTemplate.id)}
        />
      ) : null}
    </>
  );
}
