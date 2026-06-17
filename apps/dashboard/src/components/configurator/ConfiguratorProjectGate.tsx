"use client";

import { ParentDriftDialog } from "@/components/configurator/ParentDriftDialog";
import { useConfiguratorStore } from "@mashedgames/configurator-engine";
import type {
  ClientProjectPayload,
  GameConfig,
  GameProjectManifest,
  ParentDriftReport,
} from "@mashedgames/shared";
import { FlaskConical, Loader2, LogOut } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  pushConfigAssetsToPreview,
  pushRuntimeAssetsToPreview,
  usePreviewBridgeStore,
} from "@/lib/preview-bridge-store";
import { useWorkspaceSessionStore } from "@/lib/workspace-session-store";
import { useEffect, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Studio-test mode banner
// ---------------------------------------------------------------------------

function StudioTestBanner({ templateId }: { templateId: string }) {
  const router = useRouter();

  function handleExit() {
    useConfiguratorStore.getState().clearProject();
    router.push(`/studio?template=${encodeURIComponent(templateId)}`);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center justify-between gap-4 border-b border-violet-300 bg-violet-50 px-6 py-2.5"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-violet-700">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <strong>STUDIO TEST MODE</strong> — Changes here will not be saved as a Project.
        </span>
      </div>
      <button
        type="button"
        onClick={handleExit}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-violet-300 bg-white px-3 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        Exit to Studio
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main gate
// ---------------------------------------------------------------------------

export function ConfiguratorProjectGate({
  children,
  detached = false,
}: {
  children: ReactNode;
  detached?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const modeParam = searchParams.get("mode");
  const templateIdParam = searchParams.get("templateId");

  const isStudioTestMode = modeParam === "studio-test" && Boolean(templateIdParam);

  const activeSessionProjectId = useWorkspaceSessionStore(
    (s) => s.activeConfiguratorProjectId,
  );
  const effectiveProjectId =
    projectParam ?? (detached ? activeSessionProjectId : null);

  const projectId = useConfiguratorStore((s) => s.projectId);
  const [loading, setLoading] = useState(
    isStudioTestMode ? true : Boolean(projectParam),
  );
  const [error, setError] = useState<string | null>(null);
  const [driftReport, setDriftReport] = useState<ParentDriftReport | null>(null);
  const [driftOpen, setDriftOpen] = useState(false);
  const [, setPreviewBlocked] = useState(false);

  // ---------------------------------------------------------------------------
  // Studio-test mode: load template config directly (no project)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isStudioTestMode || !templateIdParam) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function loadTemplate() {
      try {
        const res = await fetch(
          `/api/templates/${encodeURIComponent(templateIdParam!)}/config`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          config?: GameConfig;
          runtimeAssets?: Record<string, string>;
        };

        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to load template.");
        }

        if (cancelled) return;

        if (data.config) {
          useConfiguratorStore
            .getState()
            .setConfig({ ...data.config, appMode: "configurator" });
        }

        if (data.runtimeAssets) {
          usePreviewBridgeStore
            .getState()
            .setRuntimeAssets(data.runtimeAssets);
          pushRuntimeAssetsToPreview();
          if (data.config) pushConfigAssetsToPreview(data.config);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTemplate();

    return () => {
      cancelled = true;
    };
  }, [isStudioTestMode, templateIdParam]);

  // ---------------------------------------------------------------------------
  // Standard project mode: load project by ID
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isStudioTestMode) return;

    if (!effectiveProjectId) {
      if (!detached) {
        router.replace("/configurator/projects");
      }
      return;
    }

    if (!detached && !projectParam && activeSessionProjectId) {
      router.replace(
        `/configurator?project=${encodeURIComponent(activeSessionProjectId)}`,
      );
      return;
    }

    if (pathname === "/configurator") {
      useWorkspaceSessionStore
        .getState()
        .setActiveConfiguratorProject(effectiveProjectId);
    }

    if (projectId === effectiveProjectId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/projects/${effectiveProjectId}`);
        const data = (await response.json()) as {
          ok?: boolean;
          error?: string;
          manifest?: GameProjectManifest;
          config?: GameConfig;
          client?: ClientProjectPayload;
          runtimeAssets?: Record<string, string>;
        };

        if (!response.ok || !data.ok || !data.manifest || !data.config || !data.client) {
          throw new Error(data.error ?? "Failed to load project.");
        }

        if (cancelled) return;

        useConfiguratorStore.getState().hydrateProject({
          manifest: data.manifest,
          config: data.config,
          client: data.client,
        });

        usePreviewBridgeStore
          .getState()
          .setRuntimeAssets(data.runtimeAssets ?? data.manifest.runtimeAssets ?? {});
        pushRuntimeAssetsToPreview();
        pushConfigAssetsToPreview(data.client);

        const driftResponse = await fetch(
          `/api/projects/${effectiveProjectId}/parent-drift`,
        );
        const driftData = (await driftResponse.json()) as {
          ok?: boolean;
          report?: ParentDriftReport;
        };

        if (!cancelled && driftData.ok && driftData.report) {
          setDriftReport(driftData.report);
          if (driftData.report.items.length > 0) {
            setDriftOpen(true);
            setPreviewBlocked(driftData.report.hasBlockingItems);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    isStudioTestMode,
    activeSessionProjectId,
    detached,
    effectiveProjectId,
    pathname,
    projectId,
    projectParam,
    router,
  ]);

  // ---------------------------------------------------------------------------
  // Render: studio-test mode path
  // ---------------------------------------------------------------------------
  if (isStudioTestMode) {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading template…
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            onClick={() =>
              router.push(
                `/studio?template=${encodeURIComponent(templateIdParam!)}`,
              )
            }
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
          >
            Back to Studio
          </button>
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <StudioTestBanner templateId={templateIdParam!} />
        {children}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: standard project mode path
  // ---------------------------------------------------------------------------
  if (!effectiveProjectId) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading project…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => {
            useWorkspaceSessionStore.getState().clearConfiguratorSession();
            useConfiguratorStore.getState().clearProject();
            router.replace("/configurator/projects");
          }}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
        >
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <>
      {children}
      <ParentDriftDialog
        open={driftOpen}
        report={driftReport}
        onDismiss={() => {
          setDriftOpen(false);
          setPreviewBlocked(false);
        }}
        onAcknowledged={() => {
          setDriftOpen(false);
          setPreviewBlocked(false);
          setDriftReport(null);
        }}
      />
    </>
  );
}
