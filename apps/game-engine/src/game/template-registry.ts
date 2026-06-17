import type Phaser from "phaser";
import { MainScene } from "./scenes/MainScene.ts";

const LAZY_SCENE_REGISTRY: Record<
  string,
  () => Promise<Phaser.Types.Scenes.SceneType>
> = {
  "catch-game": async () => {
    const { CatchGameScene } = await import("@mashedgames/templates");
    return CatchGameScene;
  },
};

export async function resolveTemplateScene(
  templateId: string,
): Promise<Phaser.Types.Scenes.SceneType> {
  const factory = LAZY_SCENE_REGISTRY[templateId];
  if (factory) return factory();
  return MainScene;
}
