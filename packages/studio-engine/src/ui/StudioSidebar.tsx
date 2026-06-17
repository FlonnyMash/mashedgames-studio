"use client";

import type { FlatFieldDefinition } from "@mashedgames/shared";
import { useStudioConfigStore } from "../store/useStudioConfigStore";
import { FlatConfigPanel } from "./FlatConfigPanel";

export function StudioSidebar({
  previewSlot,
  onImageFile,
}: {
  previewSlot?: React.ReactNode;
  onImageFile?: (
    file: File,
    field: FlatFieldDefinition,
  ) => void | Promise<void>;
}) {
  const config = useStudioConfigStore((state) => state.config);
  const selectedTemplateId = useStudioConfigStore(
    (state) => state.selectedTemplateId,
  );
  const patchConfig = useStudioConfigStore((state) => state.patchConfig);
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
        />
        {previewSlot}
      </div>
    </aside>
  );
}
