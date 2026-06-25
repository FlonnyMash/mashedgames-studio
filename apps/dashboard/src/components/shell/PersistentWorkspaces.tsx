"use client";

import { ConfiguratorProjectGate } from "@/components/configurator/ConfiguratorProjectGate";
import { ConfiguratorWorkspace } from "@/components/configurator/ConfiguratorWorkspace";
import { STUDIO_MODE_ENABLED } from "@/lib/studio-mode";
import {
  rehydrateWorkspaceSessionFromStorage,
  useWorkspaceSessionStore,
} from "@/lib/workspace-session-store";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect, type ReactNode } from "react";

/**
 * Conditional dynamic imports for all studio components.
 *
 * When STUDIO_MODE_ENABLED is false (the production default), webpack evaluates
 * the ternary at build time and eliminates the import() call entirely, ensuring
 * @mashedgames/studio-engine is never emitted into any bundle chunk.
 */
const DynStudioTemplateGate: React.ComponentType<{
  children: ReactNode;
  detached?: boolean;
}> | null = STUDIO_MODE_ENABLED
  ? dynamic(() =>
      import("@/components/studio/StudioTemplateGate").then((m) => ({
        default: m.StudioTemplateGate,
      })),
    )
  : null;

const DynStudioWorkspace: React.ComponentType<{
  suspended: boolean;
}> | null = STUDIO_MODE_ENABLED
  ? dynamic(() =>
      import("@/components/studio/StudioWorkspace").then((m) => ({
        default: m.StudioWorkspace,
      })),
    )
  : null;

function workspaceLayerClass(visible: boolean): string {
  return visible
    ? "relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden"
    : "pointer-events-none absolute inset-0 z-0 flex min-h-0 flex-1 flex-col overflow-hidden opacity-0";
}

/** Matches Suspense fallback so SSR and the first client render stay aligned. */
function WorkspaceRouteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
  );
}

function PersistentWorkspacesInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const templateParam = searchParams.get("template");
  const projectParam = searchParams.get("project");
  const sessionHydrated = useWorkspaceSessionStore((s) => s.sessionHydrated);
  const activeStudioTemplateId = useWorkspaceSessionStore(
    (s) => s.activeStudioTemplateId,
  );
  const activeConfiguratorProjectId = useWorkspaceSessionStore(
    (s) => s.activeConfiguratorProjectId,
  );

  useLayoutEffect(() => {
    rehydrateWorkspaceSessionFromStorage();
  }, []);

  useLayoutEffect(() => {
    if (pathname === "/studio/templates") {
      useWorkspaceSessionStore.getState().acknowledgeStudioSessionSuppression();
    }
  }, [pathname]);

  if (!sessionHydrated) {
    return <WorkspaceRouteShell>{children}</WorkspaceRouteShell>;
  }

  const modeParam = searchParams.get("mode");
  const templateIdParam = searchParams.get("templateId");
  const isStudioTestMode =
    pathname === "/configurator" &&
    modeParam === "studio-test" &&
    Boolean(templateIdParam);

  const isStudioListRoute = pathname === "/studio/templates";
  const isConfiguratorListRoute = pathname === "/configurator/projects";

  const showStudio =
    STUDIO_MODE_ENABLED &&
    pathname === "/studio" &&
    Boolean(templateParam ?? activeStudioTemplateId);
  const showConfigurator =
    pathname === "/configurator" &&
    (Boolean(projectParam ?? activeConfiguratorProjectId) || isStudioTestMode);

  const mountStudio =
    STUDIO_MODE_ENABLED &&
    !isStudioListRoute &&
    (Boolean(activeStudioTemplateId) ||
      (pathname === "/studio" && Boolean(templateParam)));
  const mountConfigurator =
    !isConfiguratorListRoute &&
    (Boolean(activeConfiguratorProjectId) ||
      (pathname === "/configurator" && Boolean(projectParam)) ||
      isStudioTestMode);
  const workspaceActive = showStudio || showConfigurator;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {mountStudio && DynStudioTemplateGate && DynStudioWorkspace ? (
        <div
          className={workspaceLayerClass(showStudio)}
          aria-hidden={!showStudio}
        >
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
                Loading studio…
              </div>
            }
          >
            <DynStudioTemplateGate detached={!showStudio}>
              <DynStudioWorkspace suspended={!showStudio} />
            </DynStudioTemplateGate>
          </Suspense>
        </div>
      ) : null}

      {mountConfigurator ? (
        <div
          className={workspaceLayerClass(showConfigurator)}
          aria-hidden={!showConfigurator}
        >
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
                Loading configurator…
              </div>
            }
          >
            <ConfiguratorProjectGate detached={!showConfigurator}>
              <ConfiguratorWorkspace suspended={!showConfigurator} />
            </ConfiguratorProjectGate>
          </Suspense>
        </div>
      ) : null}

      <div
        className={
          workspaceActive
            ? "hidden"
            : "relative flex min-h-0 flex-1 flex-col overflow-hidden"
        }
      >
        {children}
      </div>
    </div>
  );
}

export function PersistentWorkspaces({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceRouteShell>{children}</WorkspaceRouteShell>}>
      <PersistentWorkspacesInner>{children}</PersistentWorkspacesInner>
    </Suspense>
  );
}
