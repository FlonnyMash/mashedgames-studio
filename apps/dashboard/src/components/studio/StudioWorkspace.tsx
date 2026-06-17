"use client";

import { StudioToolsPanel } from "@/components/studio/StudioToolsPanel";
import { CenterWorkspace } from "@/components/shell/CenterWorkspace";
import { applyAssetUploadToPreview } from "@/lib/apply-asset-upload-to-preview";
import { useMenuActionsStore } from "@/lib/menu-actions-store";
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
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

export function StudioWorkspace({ suspended = false }: { suspended?: boolean }) {
  const router = useRouter();
  const initialTemplateId = useStudioConfigStore.getState().selectedTemplateId;
  const selectedTemplateId = useStudioConfigStore(
    (state) => state.selectedTemplateId,
  );

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

  /** Overwrites the active template's config.json on disk via the Next.js API. */
  const handleSaveTemplate = useCallback(async () => {
    const config = useStudioConfigStore.getState().config;
    const res = await fetch(
      `/api/templates/save-config?templateId=${encodeURIComponent(selectedTemplateId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      },
    );
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Save failed.");
    }
  }, [selectedTemplateId]);

  /** Saves the template then opens it in the Configurator in studio-test mode. */
  const handleTestInConfigurator = useCallback(async () => {
    await handleSaveTemplate();
    router.push(
      `/configurator?templateId=${encodeURIComponent(selectedTemplateId)}&mode=studio-test`,
    );
  }, [handleSaveTemplate, router, selectedTemplateId]);

  /** Re-fetches the persisted config from disk and hydrates the studio store. */
  const handleRevertTemplate = useCallback(async () => {
    const res = await fetch(
      `/api/templates/${encodeURIComponent(selectedTemplateId)}/config`,
    );
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      config?: ReturnType<typeof useStudioConfigStore.getState>["config"];
      runtimeAssets?: Record<string, string>;
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Revert failed.");
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
    toast.info("Reverted to saved template config.");
  }, [selectedTemplateId]);

  // Register workspace actions so AppMenuBar can call them without importing studio-engine.
  useEffect(() => {
    useMenuActionsStore.getState().registerWorkspaceActions({
      onSave: handleSaveTemplate,
      onRevert: handleRevertTemplate,
      onTestTemplate: handleTestInConfigurator,
      onOpenFolder: async () => {
        await fetch(
          `/api/templates/${encodeURIComponent(selectedTemplateId)}/open-folder`,
          { method: "POST" },
        );
      },
      onOpenIde: async () => {
        await fetch(
          `/api/templates/${encodeURIComponent(selectedTemplateId)}/open-ide`,
          { method: "POST" },
        );
      },
    });
    return () => useMenuActionsStore.getState().clearWorkspaceActions();
  }, [handleSaveTemplate, handleRevertTemplate, handleTestInConfigurator, selectedTemplateId]);

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
        onSave={handleSaveTemplate}
        onRevert={handleRevertTemplate}
        onTestInConfigurator={handleTestInConfigurator}
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
