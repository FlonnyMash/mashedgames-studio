import type { GameConfig } from "@mashedgames/shared";

export type DemoConfigPayload = {
  templateId: string;
  config: GameConfig;
  runtimeAssets: Record<string, string>;
};
