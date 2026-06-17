import type { GameConfig } from "./flat-game-config";

/** Maps GameConfig asset URL keys to Phaser texture keys used at runtime. */
export const CONFIG_TEXTURE_FIELD_MAP = {
  logoUrl: "logo",
  playerCatcherUrl: "player-catcher",
  collectibleGoodUrl: "collectible-good",
  collectibleBadUrl: "collectible-bad",
} as const satisfies Record<string, string>;

export type ConfigAssetFieldKey = keyof typeof CONFIG_TEXTURE_FIELD_MAP;

export function textureKeyForConfigField(fieldKey: string): string | null {
  return CONFIG_TEXTURE_FIELD_MAP[fieldKey as ConfigAssetFieldKey] ?? null;
}

export function listConfiguredAssetUploads(
  config: GameConfig,
  runtimeAssets: Record<string, string>,
): Array<{ fieldKey: ConfigAssetFieldKey; textureKey: string; absolutePath: string }> {
  const uploads: Array<{
    fieldKey: ConfigAssetFieldKey;
    textureKey: string;
    absolutePath: string;
  }> = [];

  for (const [fieldKey, textureKey] of Object.entries(CONFIG_TEXTURE_FIELD_MAP)) {
    const assetKey = fieldKey as ConfigAssetFieldKey;
    const path = config[assetKey];
    if (typeof path !== "string" || !path.trim()) {
      continue;
    }
    const relativePath = path.replace(/^\//, "");
    const absolutePath = runtimeAssets[relativePath];
    if (!absolutePath) {
      continue;
    }
    uploads.push({ fieldKey: assetKey, textureKey, absolutePath });
  }

  return uploads;
}
