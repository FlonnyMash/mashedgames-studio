"use client";

import {
  pushConfigAssetsToPreview,
  pushRuntimeAssetsToPreview,
  usePreviewBridgeStore,
} from "@/lib/preview-bridge-store";

export function applyAssetUploadToPreview(input: {
  relativePath: string;
  absolutePath: string;
  textureKey: string | null;
}): void {
  const runtimeAssets = {
    ...usePreviewBridgeStore.getState().runtimeAssets,
    [input.relativePath]: input.absolutePath,
  };

  usePreviewBridgeStore.getState().setRuntimeAssets(runtimeAssets);
  pushRuntimeAssetsToPreview();

  const messenger = usePreviewBridgeStore.getState().messenger;
  if (input.textureKey && messenger) {
    messenger.sendLoadExternalAsset(input.textureKey, input.absolutePath);
  }
}
