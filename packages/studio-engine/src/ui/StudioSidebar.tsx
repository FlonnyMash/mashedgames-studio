"use client";

import type {
  FlatFieldDefinition,
  TemplateFieldDescriptor,
  UIModule,
} from "@mashedgames/shared";
import { useStudioConfigStore } from "../store/useStudioConfigStore";
import { DynamicTemplateFieldPanel } from "./DynamicTemplateFieldPanel";
import { FlatConfigPanel } from "./FlatConfigPanel";

export function StudioSidebar({
  previewSlot,
  onImageFile,
  templateFields = [],
  supportsUI,
  onTemplateImageFile,
}: {
  previewSlot?: React.ReactNode;
  onImageFile?: (
    file: File,
    field: FlatFieldDefinition,
  ) => void | Promise<void>;
  /** The active template's dynamic fields, from its manifest.ts. */
  templateFields?: TemplateFieldDescriptor[];
  /**
   * The active template's declared `manifest.supportsUI`. Gates the
   * universal Start Screen/Highscore/Lead Capture/Timer groups — a
   * template that doesn't declare a module must not show its controls.
   * `undefined` means "not loaded yet" and shows all groups.
   */
  supportsUI?: UIModule[];
  onTemplateImageFile?: (
    file: File,
    field: TemplateFieldDescriptor,
  ) => void | Promise<void>;
}) {
  const config = useStudioConfigStore((state) => state.config);
  const selectedTemplateId = useStudioConfigStore(
    (state) => state.selectedTemplateId,
  );
  const patchConfig = useStudioConfigStore((state) => state.patchConfig);
  const patchTemplateField = useStudioConfigStore(
    (state) => state.patchTemplateField,
  );
  const resetConfig = useStudioConfigStore((state) => state.resetConfig);

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-5">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Game controls</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Flat configuration for the live preview</p>
        </div>
        <button
          type="button"
          onClick={resetConfig}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Reset
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <FlatConfigPanel
          config={config}
          onFieldChange={patchConfig}
          onImageFile={onImageFile}
          assetPreviewContext={{ templateId: selectedTemplateId }}
          supportsUI={supportsUI}
        />
        {templateFields.length > 0 && (
          <div className="mt-3">
            <DynamicTemplateFieldPanel
              fields={templateFields}
              values={config.fields ?? {}}
              onFieldChange={patchTemplateField}
              onImageFile={onTemplateImageFile}
              assetPreviewContext={{ templateId: selectedTemplateId }}
            />
          </div>
        )}
        {previewSlot}
      </div>
    </aside>
  );
}
