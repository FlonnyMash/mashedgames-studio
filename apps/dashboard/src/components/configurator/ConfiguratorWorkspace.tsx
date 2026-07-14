"use client";

import { ConfiguratorToolsShell } from "@/components/configurator/ConfiguratorToolsShell";
import { CenterWorkspace } from "@/components/shell/CenterWorkspace";
import { applyAssetUploadToPreview } from "@/lib/apply-asset-upload-to-preview";
import { projectFetch } from "@/lib/project-api-client";
import { saveProjectClientNow } from "@/hooks/useSaveGameProject";
import { saveProjectAssetWithFallback } from "@/lib/import-project-asset-client";
import { useMenuActionsStore } from "@/lib/menu-actions-store";
import {
  pushConfigAssetsToPreview,
  pushRuntimeAssetsToPreview,
  usePreviewBridgeStore,
} from "@/lib/preview-bridge-store";
import { useConfigStore } from "@/store/useConfigStore";
import type {
  ClientProjectPayload,
  GameConfig,
  GameProjectManifest,
  TemplateFieldDescriptor,
  UIModule,
} from "@mashedgames/shared";
import {
  ConfiguratorSidebar,
  useConfiguratorStore,
} from "@mashedgames/configurator-engine";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

export function ConfiguratorWorkspace({
  suspended = false,
}: {
  suspended?: boolean;
}) {
  const initialTemplateId =
    useConfiguratorStore.getState().selectedTemplateId;

  const projectId = useConfiguratorStore((state) => state.projectId);
  const setAssetSaveHandler = useConfiguratorStore(
    (state) => state.setAssetSaveHandler,
  );
  const templateFields = usePreviewBridgeStore((state) => state.templateFields);
  const supportsUI = usePreviewBridgeStore((state) => state.supportsUI);

  // Sync configurator state into the preview config store.
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

  // Wire asset save handler for the project.
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
        templateFields: usePreviewBridgeStore.getState().templateFields,
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

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  const handleSaveProject = useCallback(async () => {
    const id = useConfiguratorStore.getState().projectId;
    if (!id) {
      toast.error("No project loaded.");
      return;
    }
    await saveProjectClientNow(id);
    toast.success("Project saved.");
  }, []);

  // -------------------------------------------------------------------------
  // Revert
  // -------------------------------------------------------------------------
  const handleRevertProject = useCallback(async () => {
    const id = useConfiguratorStore.getState().projectId;
    if (!id) return;

    const res = await projectFetch(`/api/projects/${id}`);
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      manifest?: GameProjectManifest;
      config?: GameConfig;
      client?: ClientProjectPayload;
      runtimeAssets?: Record<string, string>;
      templateFields?: TemplateFieldDescriptor[];
      supportsUI?: UIModule[];
    };

    if (!res.ok || !data.ok || !data.manifest || !data.config || !data.client) {
      throw new Error(data.error ?? "Revert failed.");
    }

    usePreviewBridgeStore.getState().setTemplateFields(data.templateFields ?? []);
    usePreviewBridgeStore.getState().setSupportsUI(data.supportsUI ?? []);

    useConfiguratorStore.getState().hydrateProject({
      manifest: data.manifest,
      config: data.config,
      client: data.client,
    });

    usePreviewBridgeStore
      .getState()
      .setRuntimeAssets(
        data.runtimeAssets ?? data.manifest.runtimeAssets ?? {},
      );
    pushRuntimeAssetsToPreview();
    pushConfigAssetsToPreview(data.client);

    toast.info("Reverted to last saved state.");
  }, []);

  // -------------------------------------------------------------------------
  // Register menu actions
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!projectId) return;

    useMenuActionsStore.getState().registerWorkspaceActions({
      onSave: handleSaveProject,
      onRevert: handleRevertProject,
      onOpenFolder: async () => {
        await fetch(`/api/projects/${encodeURIComponent(projectId)}/open-folder`, {
          method: "POST",
        });
      },
      onOpenIde: async () => {
        await fetch(`/api/projects/${encodeURIComponent(projectId)}/open-ide`, {
          method: "POST",
        });
      },
    });

    return () => useMenuActionsStore.getState().clearWorkspaceActions();
  }, [projectId, handleSaveProject, handleRevertProject]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ConfiguratorToolsShell
        onSave={handleSaveProject}
        onRevert={handleRevertProject}
      />
      <CenterWorkspace
        appMode="configurator"
        initialTemplateId={initialTemplateId}
        previewSuspended={suspended}
      />
      <ConfiguratorSidebar templateFields={templateFields} supportsUI={supportsUI} />
    </div>
  );
}
