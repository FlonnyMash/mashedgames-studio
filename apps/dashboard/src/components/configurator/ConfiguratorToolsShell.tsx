"use client";

import { CloudflareDeployButton } from "@/components/configurator/CloudflareDeployButton";
import { ExportGameButton } from "@/components/configurator/ExportGameButton";
import { ExitConfiguratorProjectButton } from "@/components/configurator/ExitConfiguratorProjectButton";
import { WorkspaceActionToolbar } from "@/components/shell/WorkspaceActionToolbar";
import { useConfiguratorStore } from "@mashedgames/configurator-engine";
import { useMemo } from "react";

interface ConfiguratorToolsShellProps {
  onSave: () => Promise<void>;
  onRevert: () => Promise<void>;
}

export function ConfiguratorToolsShell({
  onSave,
  onRevert,
}: ConfiguratorToolsShellProps) {
  const projectId = useConfiguratorStore((state) => state.projectId);
  const config = useConfiguratorStore((s) => s.config);
  const savedClient = useConfiguratorStore((s) => s.savedClient);

  const hasUnsaved = useMemo(
    () => useConfiguratorStore.getState().hasUnsavedClient(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, savedClient],
  );

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-r border-zinc-200 bg-white">
      <header className="border-b border-zinc-200 px-6 py-5">
        <h2 className="text-lg font-semibold text-zinc-900">Workspace</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Project save and export</p>
      </header>

      {/* Unified action toolbar */}
      {projectId ? (
        <div className="border-b border-zinc-200 px-6 py-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Actions
          </p>
          <WorkspaceActionToolbar
            onSave={onSave}
            onRevert={onRevert}
            hasUnsaved={hasUnsaved}
            /* Undo not yet wired — stub shows informational toast via disabled state */
          />
        </div>
      ) : null}

      <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
        <ExportGameButton />
        <CloudflareDeployButton />
        <ExitConfiguratorProjectButton />
      </div>
    </aside>
  );
}
