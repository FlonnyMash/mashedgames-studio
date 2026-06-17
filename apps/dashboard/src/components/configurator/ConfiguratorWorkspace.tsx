"use client";

import { ConfiguratorToolsShell } from "@/components/configurator/ConfiguratorToolsShell";
import { CenterWorkspace } from "@/components/shell/CenterWorkspace";
import {
  FlatConfigIpcError,
  getProjectListViaElectron,
  loadFlatConfigViaElectron,
  saveFlatConfigViaElectron,
} from "@/lib/flat-config-ipc";
import { applyAssetUploadToPreview } from "@/lib/apply-asset-upload-to-preview";
import { saveProjectAssetWithFallback } from "@/lib/import-project-asset-client";
import {
  pushRuntimeAssetsToPreview,
  usePreviewBridgeStore,
} from "@/lib/preview-bridge-store";
import { useConfigStore } from "@/store/useConfigStore";
import {
  ConfiguratorSidebar,
  useConfiguratorStore,
} from "@mashedgames/configurator-engine";
import { useCallback, useEffect, useState } from "react";

export function ConfiguratorWorkspace({
  suspended = false,
}: {
  suspended?: boolean;
}) {
  const initialTemplateId =
    useConfiguratorStore.getState().selectedTemplateId;
  const selectedTemplateId = useConfiguratorStore(
    (state) => state.selectedTemplateId,
  );

  const projectId = useConfiguratorStore((state) => state.projectId);
  const setAssetSaveHandler = useConfiguratorStore(
    (state) => state.setAssetSaveHandler,
  );

  const [availableProjects, setAvailableProjects] = useState<string[]>([]);

  const isDesktop = typeof window !== "undefined" && Boolean(window.electron);

  // Refresh the save list whenever the desktop runtime loads or the open
  // project changes — saves are scoped to the current projectId only.
  useEffect(() => {
    if (!isDesktop || !projectId) {
      setAvailableProjects([]);
      return;
    }
    getProjectListViaElectron("configurator", { projectId })
      .then(setAvailableProjects)
      .catch(() => setAvailableProjects([]));
  }, [isDesktop, projectId]);

  const handleSave = useCallback(
    async (projectName: string) => {
      const config = useConfiguratorStore.getState().config;
      await saveFlatConfigViaElectron(projectName, config);
      const currentProjectId = useConfiguratorStore.getState().projectId;
      if (!currentProjectId) return;
      getProjectListViaElectron("configurator", {
        projectId: currentProjectId,
      })
        .then(setAvailableProjects)
        .catch(() => undefined);
    },
    [],
  );

  const handleLoad = useCallback(async (projectName: string) => {
    try {
      const config = await loadFlatConfigViaElectron(projectName);
      useConfiguratorStore.getState().setConfig(config);
    } catch (error) {
      const message =
        error instanceof FlatConfigIpcError || error instanceof Error
          ? error.message
          : "Load failed.";
      window.alert(message);
    }
  }, []);

  useEffect(() => {
    const syncFromConfigurator = (
      state: ReturnType<typeof useConfiguratorStore.getState>,
    ) => {
      useConfigStore.getState().setSelectedTemplateId(state.selectedTemplateId);
      useConfigStore.getState().setConfig(state.config);
    };
    syncFromConfigurator(useConfiguratorStore.getState());
    return useConfiguratorStore.subscribe(syncFromConfigurator);
  }, []);

  useEffect(() => {
    if (!projectId) {
      setAssetSaveHandler(null);
      return;
    }

    setAssetSaveHandler(async (input) => {
      const data = await saveProjectAssetWithFallback({
        projectId: input.projectId,
        file: input.file,
        targetPath: input.fieldKey,
      });

      if (data.manifest?.runtimeAssets) {
        usePreviewBridgeStore
          .getState()
          .setRuntimeAssets(data.manifest.runtimeAssets);
      }

      applyAssetUploadToPreview({
        relativePath: data.relativePath,
        absolutePath: data.absolutePath,
        textureKey: data.textureKey,
      });

      return data;
    });

    return () => setAssetSaveHandler(null);
  }, [projectId, setAssetSaveHandler]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ConfiguratorToolsShell
        availableProjects={isDesktop ? availableProjects : undefined}
        onSave={isDesktop ? handleSave : undefined}
        onLoad={isDesktop ? handleLoad : undefined}
      />
      <CenterWorkspace
        appMode="configurator"
        initialTemplateId={initialTemplateId}
        previewSuspended={suspended}
      />
      <ConfiguratorSidebar />
    </div>
  );
}
