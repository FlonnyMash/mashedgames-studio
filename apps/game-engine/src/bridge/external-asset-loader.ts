import {
  AssetReadyPayloadSchema,
  BRIDGE_MESSAGE_TYPE,
  isProjectRelativeAssetPath,
} from "@mashedgames/shared";
import { engineMessenger } from "./messenger.ts";
import Phaser from "phaser";
import type { Game as PhaserGame } from "phaser";
import { getStudioAssetUrl, normalizeDeployAssetUrl, withCacheBust } from "./asset-loader.ts";
import { getParentTargetOrigin } from "./dashboard-origin.ts";

function findLoadableScene(game: PhaserGame): Phaser.Scene | null {
  const scenes = game.scene.scenes;
  const active = scenes.find((scene) => scene.sys.isActive());
  if (active?.load) {
    return active;
  }
  return scenes.find((scene) => Boolean(scene.load)) ?? null;
}

function isWebResolvableAssetUrl(value: string): boolean {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("/")
  );
}

/** Normalize legacy demo-bundle paths that break under /engine/ iframes. */
function resolveExternalAssetUrl(
  absolutePath: string,
  projectId?: string | null,
): string {
  const normalized = normalizeDeployAssetUrl(absolutePath);
  if (isWebResolvableAssetUrl(normalized)) {
    return withCacheBust(normalized);
  }
  const assetsIndex = normalized.toLowerCase().indexOf("/assets/");
  if (projectId && assetsIndex >= 0) {
    const relativePath = normalized.slice(assetsIndex + 1);
    if (isProjectRelativeAssetPath(relativePath)) {
      return withCacheBust(getStudioAssetUrl(relativePath, projectId));
    }
  }
  return withCacheBust(
    `mashedgames-studio://${encodeURIComponent(normalized)}`,
  );
}

export function loadExternalAsset(
  game: PhaserGame,
  key: string,
  absolutePath: string,
  projectId?: string | null,
): boolean {
  const scene = findLoadableScene(game);
  if (!scene) return false;

  const loader = scene.load;
  const url = resolveExternalAssetUrl(absolutePath, projectId);

  if (scene.textures.exists(key)) {
    scene.textures.remove(key);
  }

  const onComplete = () => {
    loader.off(Phaser.Loader.Events.COMPLETE, onComplete);
    const payload = AssetReadyPayloadSchema.parse({ key });
    window.parent.postMessage(
      { type: BRIDGE_MESSAGE_TYPE.ASSET_READY, payload },
      getParentTargetOrigin(),
    );
  };

  const onError = (file: Phaser.Loader.File) => {
    if (file.key !== key) return;
    loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    engineMessenger.sendAssetLoadError({
      key,
      message: `Failed to load external asset: ${url}`,
    });
  };

  loader.off(Phaser.Loader.Events.COMPLETE, onComplete);
  loader.once(Phaser.Loader.Events.COMPLETE, onComplete);
  loader.once(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  loader.image(key, url);
  if (!loader.isLoading()) {
    loader.start();
  }
  return true;
}
