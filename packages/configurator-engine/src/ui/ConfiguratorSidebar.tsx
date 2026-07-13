"use client";

import type { FlatFieldDefinition, TemplateFieldDescriptor } from "@mashedgames/shared";
import { useConfiguratorStore } from "../store/useConfiguratorStore";
import { DynamicTemplateFieldPanel } from "./DynamicTemplateFieldPanel";
import { FlatConfigPanel } from "./FlatConfigPanel";

export function ConfiguratorSidebar({
  previewSlot,
  onImageFile,
  templateFields = [],
}: {
  previewSlot?: React.ReactNode;
  onImageFile?: (
    file: File,
    field: FlatFieldDefinition,
  ) => void | Promise<void>;
  /** The active template's dynamic fields, from its manifest.ts. */
  templateFields?: TemplateFieldDescriptor[];
}) {
  const config = useConfiguratorStore((state) => state.config);
  const projectId = useConfiguratorStore((state) => state.projectId);
  const patchConfig = useConfiguratorStore((state) => state.patchConfig);
  const patchTemplateField = useConfiguratorStore(
    (state) => state.patchTemplateField,
  );
  const resetBranding = useConfiguratorStore((state) => state.resetBranding);
  const uploadBrandingAsset = useConfiguratorStore(
    (state) => state.uploadBrandingAsset,
  );

  const handleImageFile =
    onImageFile ??
    (async (file: File, field: FlatFieldDefinition) => {
      try {
        await uploadBrandingAsset(file, field.key);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload sprite.";
        window.alert(message);
      }
    });

  const handleTemplateImageFile = async (
    file: File,
    field: TemplateFieldDescriptor,
  ) => {
    try {
      await uploadBrandingAsset(file, field.key);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to upload sprite.";
      window.alert(message);
    }
  };

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-5">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Brand controls</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Customize the live preview — mechanics locked
          </p>
        </div>
        <button
          type="button"
          onClick={resetBranding}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Reset
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <FlatConfigPanel
          config={config}
          mode="configurator"
          onFieldChange={patchConfig}
          onImageFile={handleImageFile}
          assetPreviewContext={{ projectId: projectId ?? undefined }}
        />
        {templateFields.length > 0 && (
          <div className="mt-3">
            <DynamicTemplateFieldPanel
              fields={templateFields}
              values={config.fields ?? {}}
              onFieldChange={patchTemplateField}
              onImageFile={handleTemplateImageFile}
              assetPreviewContext={{ projectId: projectId ?? undefined }}
            />
          </div>
        )}
        {previewSlot}
      </div>
    </aside>
  );
}
