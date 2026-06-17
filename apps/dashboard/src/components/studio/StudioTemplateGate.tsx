"use client";

import { getStudioTemplateOptions } from "@/lib/template-options";
import { useWorkspaceSessionStore } from "@/lib/workspace-session-store";
import { useConfigStore } from "@/store/useConfigStore";
import { useStudioConfigStore } from "@mashedgames/studio-engine";
import type { GameTemplateId } from "@mashedgames/shared";
import type { TemplateOverviewEntry } from "@/lib/template-overview-types";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export function StudioTemplateGate({
  children,
  detached = false,
}: {
  children: ReactNode;
  /** Keep template alive in the background when another route is active. */
  detached?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const templateParam = searchParams.get("template");
  const activeSessionTemplateId = useWorkspaceSessionStore(
    (s) => s.activeStudioTemplateId,
  );
  const effectiveTemplateId =
    templateParam ?? (detached ? activeSessionTemplateId : null);

  const selectedTemplateId = useStudioConfigStore((s) => s.selectedTemplateId);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingUrlTemplateSyncRef = useRef<GameTemplateId | null>(null);

  const staticTemplateOptions = useMemo(() => getStudioTemplateOptions(), []);
  /** Set of IDs fetched live from /api/templates. Null = fetch pending. */
  const [apiTemplateIds, setApiTemplateIds] = useState<Set<string> | null>(
    null,
  );

  const fetchApiTemplates = useCallback(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: { ok?: boolean; templates?: TemplateOverviewEntry[] } | null) => {
          const ids =
            data?.ok && Array.isArray(data.templates)
              ? new Set(data.templates.map((t) => t.id))
              : new Set<string>();
          setApiTemplateIds(ids);
        },
      )
      .catch(() => setApiTemplateIds(new Set()));
  }, []);

  useEffect(() => {
    fetchApiTemplates();
  }, [fetchApiTemplates]);

  useEffect(() => {
    if (detached || pathname !== "/studio" || !ready) {
      return;
    }

    const currentTemplate = searchParams.get("template");
    if (
      pendingUrlTemplateSyncRef.current &&
      currentTemplate === pendingUrlTemplateSyncRef.current
    ) {
      pendingUrlTemplateSyncRef.current = null;
    }
    if (currentTemplate === selectedTemplateId) {
      return;
    }

    const next = new URLSearchParams(searchParams.toString());
    next.set("template", selectedTemplateId);
    pendingUrlTemplateSyncRef.current = selectedTemplateId;
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [detached, pathname, ready, router, searchParams, selectedTemplateId]);

  useEffect(() => {
    if (!effectiveTemplateId) {
      if (!detached) {
        router.replace("/studio/templates");
      }
      return;
    }

    if (!detached && !templateParam && activeSessionTemplateId) {
      router.replace(
        `/studio?template=${encodeURIComponent(activeSessionTemplateId)}`,
      );
      return;
    }

    const knownStatic = staticTemplateOptions.some(
      (t) => t.id === effectiveTemplateId,
    );
    const knownApi = apiTemplateIds?.has(effectiveTemplateId) ?? false;

    if (!knownStatic && apiTemplateIds === null) {
      // API fetch still in flight — stay in loading state rather than error.
      return;
    }

    if (!knownStatic && !knownApi) {
      setError(
        `Unknown template "${effectiveTemplateId}". Import it or pick from the list.`,
      );
      setReady(false);
      return;
    }

    const pendingUrlTemplate = pendingUrlTemplateSyncRef.current;
    if (
      pendingUrlTemplate &&
      templateParam &&
      templateParam !== pendingUrlTemplate &&
      selectedTemplateId === pendingUrlTemplate
    ) {
      // URL is still catching up to a recent store-driven change. Avoid
      // writing stale query state back into the stores and causing flips.
      return;
    }
    if (pendingUrlTemplate && templateParam === pendingUrlTemplate) {
      pendingUrlTemplateSyncRef.current = null;
    }

    setError(null);
    // Only bind session while on the workspace route — avoids undoing an exit
    // to /studio/templates while the old ?template= query is still in flight.
    if (pathname === "/studio") {
      useWorkspaceSessionStore
        .getState()
        .setActiveStudioTemplate(effectiveTemplateId);
    }

    if (selectedTemplateId !== effectiveTemplateId) {
      useStudioConfigStore
        .getState()
        .setSelectedTemplateId(effectiveTemplateId as GameTemplateId);
    }
    if (useConfigStore.getState().selectedTemplateId !== effectiveTemplateId) {
      useConfigStore
        .getState()
        .setSelectedTemplateId(effectiveTemplateId as GameTemplateId);
    }

    setReady(true);
  }, [
    activeSessionTemplateId,
    apiTemplateIds,
    detached,
    effectiveTemplateId,
    pathname,
    selectedTemplateId,
    staticTemplateOptions,
    templateParam,
    router,
  ]);

  if (!effectiveTemplateId) {
    return null;
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => {
            useWorkspaceSessionStore.getState().clearStudioSession();
            router.replace("/studio/templates");
          }}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50"
        >
          Back to templates
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading template…
      </div>
    );
  }

  return <>{children}</>;
}
