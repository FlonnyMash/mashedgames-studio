"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { AppMenuBar } from "@/components/shell/AppMenuBar";
import { BrandMarkHomeLink } from "@/components/shell/BrandMarkHomeLink";
import { EnvironmentNav } from "@/components/shell/EnvironmentNav";
import { MetaBuilderDevFabHost } from "@/components/shell/MetaBuilderDevFabHost";
import { PersistentWorkspaces } from "@/components/shell/PersistentWorkspaces";
import { TemplatePreviewWarmup } from "@/components/shell/TemplatePreviewWarmup";
import { useHomeNavigation } from "@/hooks/useHomeNavigation";
import { STUDIO_MODE_ENABLED } from "@/lib/studio-mode";
import {
  configuratorWorkspaceHref,
  studioWorkspaceHref,
  useWorkspaceSessionStore,
} from "@/lib/workspace-session-store";
import { usePlatformStore } from "@/store/usePlatformStore";
import { Lock } from "lucide-react";
import { UserMenu } from "@/components/shell/UserMenu";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isStudio = pathname.startsWith("/studio");
  const isConfigurator = pathname.startsWith("/configurator");
  const isStore = pathname.startsWith("/dashboard/store");
  const appName = usePlatformStore((s) => s.appName);
  const primaryColor = usePlatformStore((s) => s.primaryColor);
  const enableLeadGen = usePlatformStore((s) => s.features.enableLeadGen);

  useLayoutEffect(() => {
    document.title = appName;
  }, [appName]);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--platform-primary", primaryColor);
  }, [primaryColor]);
  const activeStudioTemplateId = useWorkspaceSessionStore(
    (s) => s.activeStudioTemplateId,
  );
  const activeConfiguratorProjectId = useWorkspaceSessionStore(
    (s) => s.activeConfiguratorProjectId,
  );
  const studioHref = studioWorkspaceHref(activeStudioTemplateId);
  const configuratorHref = configuratorWorkspaceHref(activeConfiguratorProjectId);
  const { requestHomeNavigation, homeNavigationDialog } = useHomeNavigation();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TemplatePreviewWarmup />
      <AppMenuBar />
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <BrandMarkHomeLink onHomeClick={requestHomeNavigation} />
          <EnvironmentNav
            appName={appName}
            primaryColor={primaryColor}
            isHome={isHome}
            isStudio={isStudio}
            isStore={isStore}
            isConfigurator={isConfigurator}
            showStudioTab={STUDIO_MODE_ENABLED}
            studioHref={STUDIO_MODE_ENABLED ? studioHref : ""}
            storeHref="/dashboard/store"
            configuratorHref={configuratorHref}
            onHomeClick={requestHomeNavigation}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!enableLeadGen}
            title={
              enableLeadGen
                ? "Lead generation"
                : "Upgrade your license to enable lead generation"
            }
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              enableLeadGen
                ? "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                : "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400 opacity-50"
            }`}
          >
            {!enableLeadGen ? (
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : null}
            Lead Generation
          </button>
          <p className="hidden text-xs text-zinc-500 sm:block">
            {isStore
              ? "Browse owned games and unlock new templates"
              : STUDIO_MODE_ENABLED && isStudio
                ? "Build mechanics & publish templates"
                : isConfigurator
                  ? "White-label branding for clients"
                  : STUDIO_MODE_ENABLED
                    ? "Choose Studio or Configurator to get started"
                    : "Open a project to get started"}
          </p>
          <UserMenu />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PersistentWorkspaces>{children}</PersistentWorkspaces>
      </main>
      {homeNavigationDialog}
      <MetaBuilderDevFabHost />
    </div>
  );
}
