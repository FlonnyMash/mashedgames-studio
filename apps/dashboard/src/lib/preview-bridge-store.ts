"use client";

import { createDashboardMessenger } from "@/bridge/messenger";
import {
  listConfiguredAssetUploads,
  type GameConfig,
  type TemplateFieldDescriptor,
  type UIModule,
} from "@mashedgames/shared";
import { create } from "state";

type PreviewMessenger = ReturnType<typeof createDashboardMessenger>;

type PreviewBridgeStore = {
  messenger: PreviewMessenger | null;
  runtimeAssets: Record<string, string>;
  /** The active template's dynamic fields — needed to resolve image-field texture keys. */
  templateFields: TemplateFieldDescriptor[];
  /**
   * The active template's declared `manifest.supportsUI`. This is the
   * authoritative source for whether a universal overlay module (Start
   * Screen, Highscore, Lead Capture, Countdown Timer) may render — the
   * overlay shell and the config panels must consult this before trusting
   * any raw GameConfig `showXxx` boolean.
   */
  supportsUI: UIModule[];
  setMessenger: (messenger: PreviewMessenger | null) => void;
  setRuntimeAssets: (assets: Record<string, string>) => void;
  setTemplateFields: (fields: TemplateFieldDescriptor[]) => void;
  setSupportsUI: (modules: UIModule[]) => void;
};

export const usePreviewBridgeStore = create<PreviewBridgeStore>((set) => ({
  messenger: null,
  runtimeAssets: {},
  templateFields: [],
  supportsUI: [],
  setMessenger: (messenger) => set({ messenger }),
  setRuntimeAssets: (runtimeAssets) => set({ runtimeAssets }),
  setTemplateFields: (templateFields) => set({ templateFields }),
  setSupportsUI: (supportsUI) => set({ supportsUI }),
}));

export function pushRuntimeAssetsToPreview(): void {
  const { messenger, runtimeAssets } = usePreviewBridgeStore.getState();
  if (!messenger || Object.keys(runtimeAssets).length === 0) {
    return;
  }
  messenger.sendRuntimeAssets(runtimeAssets);
}

export function pushConfigAssetsToPreview(config: GameConfig): void {
  const { messenger, runtimeAssets, templateFields } =
    usePreviewBridgeStore.getState();
  if (!messenger) {
    return;
  }

  for (const upload of listConfiguredAssetUploads(config, runtimeAssets, templateFields)) {
    messenger.sendLoadExternalAsset(upload.textureKey, upload.absolutePath);
  }
}
