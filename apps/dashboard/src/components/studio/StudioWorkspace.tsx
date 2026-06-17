"use client";

import { StudioToolsPanel } from "@/components/studio/StudioToolsPanel";
import { CenterWorkspace } from "@/components/shell/CenterWorkspace";
import {
  FlatConfigIpcError,
  getProjectListViaElectron,
  loadFlatConfigViaElectron,
  saveFlatConfigViaElectron,
} from "@/lib/flat-config-ipc";
import { applyAssetUploadToPreview } from "@/lib/apply-asset-upload-to-preview";
import { saveTemplateAssetWithFallback } from "@/lib/import-template-asset-client";
import {
  pushConfigAssetsToPreview,
  pushRuntimeAssetsToPreview,
  usePreviewBridgeStore,
} from "@/lib/preview-bridge-store";
import { useConfigStore } from "@/store/useConfigStore";
import {
  BASELINE_TEMPLATE_ID,
  normalizeTemplateId,
  type FlatFieldDefinition,
} from "@mashedgames/shared";
import { StudioSidebar, useStudioConfigStore } from "@mashedgames/studio-engine";
import { useCallback, useEffect, useState } from "react";

export function StudioWorkspace({ suspended = false }: { suspended?: boolean }) {
  const initialTemplateId = useStudioConfigStore.getState().selectedTemplateId;
  const selectedTemplateId = useStudioConfigStore(
    (state) => state.selectedTemplateId,
  );
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);

  const isDesktop = typeof window !== "undefined" && Boolean(window.electron);

  useEffect(() => {
    const studioState = useStudioConfigStore.getState();
    useStudioConfigStore.getState().hydrateConfig(studioState.config);

    if (
      normalizeTemplateId(studioState.selectedTemplateId) ===
        BASELINE_TEMPLATE_ID &&
      studioState.config.showLeadCapture === false
    ) {
      useStudioConfigStore.getState().patchConfig("showLeadCapture", true);
    }

    const syncFromStudio = (
      state: ReturnType<typeof useStudioConfigStore.getState>,
    ) => {
      useConfigStore.getState().setSelectedTemplateId(state.selectedTemplateId);
      useConfigStore.getState().setConfig(state.config);
    };
    syncFromStudio(useStudioConfigStore.getState());
    return useStudioConfigStore.subscribe(syncFromStudio);
  }, []);

  // Refresh the save list whenever the desktop runtime loads or the active
  // template changes — each template owns its own isolated save slot list.
  useEffect(() => {
    if (!isDesktop) return;
    getProjectListViaElectron("studio", { templateId: selectedTemplateId })
      .then(setAvailableProjects)
      .catch(() => setAvailableProjects([]));
  }, [isDesktop, selectedTemplateId]);

  const handleSave = useCallback(
    async (projectName: string) => {
      const config = useStudioConfigStore.getState().config;
      await saveFlatConfigViaElectron(projectName, config);
      getProjectListViaElectron("studio", { templateId: selectedTemplateId })
        .then(setAvailableProjects)
        .catch(() => undefined);
    },
    [selectedTemplateId],
  );

  const handleLoad = useCallback(async (projectName: string) => {
    try {
      const config = await loadFlatConfigViaElectron(projectName);
      useStudioConfigStore.getState().hydrateConfig(config);
    } catch (error) {
      const message =
        error instanceof FlatConfigIpcError || error instanceof Error
          ? error.message
          : "Load failed.";
      window.alert(message);
    }
  }, []);

  const handleImageFile = useCallback(
    async (file: File, field: FlatFieldDefinition) => {
      try {
        const data = await saveTemplateAssetWithFallback({
          templateId: selectedTemplateId,
          file,
          targetPath: field.key,
        });

        applyAssetUploadToPreview(data);
        useStudioConfigStore
          .getState()
          .patchConfig(field.key, data.relativePath as never);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload sprite.";
        window.alert(message);
      }
    },
    [selectedTemplateId],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTemplateConfig() {
      try {
        const response = await fetch(
          `/api/templates/${encodeURIComponent(selectedTemplateId)}/config`,
        );
        const data = (await response.json()) as {
          ok?: boolean;
          config?: ReturnType<typeof useStudioConfigStore.getState>["config"];
          runtimeAssets?: Record<string, string>;
        };

        if (!response.ok || !data.ok || cancelled) {
          return;
        }

        if (data.config) {
          useStudioConfigStore.getState().hydrateConfig(data.config);
        }

        if (data.runtimeAssets) {
          usePreviewBridgeStore.getState().setRuntimeAssets(data.runtimeAssets);
          pushRuntimeAssetsToPreview();
          pushConfigAssetsToPreview(
            data.config ?? useStudioConfigStore.getState().config,
          );
        }
      } catch {
        // Template may not have a saved config yet.
      }
    }

    void loadTemplateConfig();

    return () => {
      cancelled = true;
    };
  }, [selectedTemplateId]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <StudioToolsPanel
        availableProjects={isDesktop ? availableProjects : undefined}
        onSave={isDesktop ? handleSave : undefined}
        onLoad={isDesktop ? handleLoad : undefined}
      />
      <CenterWorkspace
        appMode="studio"
        initialTemplateId={initialTemplateId}
        previewSuspended={suspended}
      />
      <StudioSidebar onImageFile={handleImageFile} />
    </div>
  );
}
