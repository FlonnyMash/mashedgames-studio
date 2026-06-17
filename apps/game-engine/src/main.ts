import "./style.css";
import {
  DEFAULT_GAME_CONFIG,
  normalizeGameConfig,
  normalizeTemplateId,
  type GameConfig,
} from "@mashedgames/shared";
import Phaser from "phaser";
import { engineMessenger, setupBridge } from "./bridge/messenger.ts";
import { createGameConfig } from "./game/config.ts";
import { resolveTemplateScene } from "./game/template-registry.ts";
import { bindGamePreviewResize } from "./game/previewResize.ts";
import { getMainScene, MAIN_SCENE_KEY } from "./game/scenes/MainScene.ts";
import {
  applyOverlayConfig,
  bindSceneLifecycleBridge,
  initOverlayShell,
} from "./overlays/overlay-shell.ts";

const GAME_START_EVENT = "GAME_START";

let game: Phaser.Game | null = null;
let latestConfig: GameConfig = { ...DEFAULT_GAME_CONFIG };

function applyRuntimeConfig(config: GameConfig): void {
  latestConfig = {
    ...config,
    activeTemplateId: normalizeTemplateId(config.activeTemplateId),
  };
  applyOverlayConfig(latestConfig);
  if (game) {
    getMainScene(game)?.applyConfig(latestConfig);
    game.events.emit("bridge:config-update", latestConfig);
  }
}

function getTemplateIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("template") ?? params.get("game");
  if (fromUrl) {
    return normalizeTemplateId(fromUrl);
  }
  return normalizeTemplateId(latestConfig.activeTemplateId);
}

async function ensureGame(): Promise<Phaser.Game> {
  if (game) {
    return game;
  }

  const templateId = getTemplateIdFromUrl();
  const scene = await resolveTemplateScene(templateId);

  game = new Phaser.Game(
    createGameConfig({
      parent: "game-container",
      backgroundColor: latestConfig.backgroundColor,
      scene,
    }),
  );

  bindGamePreviewResize(game);

  game.events.once("ready", () => {
    getMainScene(game!)?.applyConfig(latestConfig);
    game!.events.emit("bridge:config-update", latestConfig);
    applyOverlayConfig(latestConfig);
    bindSceneLifecycleBridge(game!);
    engineMessenger.sendEngineReady();
  });

  return game;
}

function handleLoadTemplate(templateId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("template", templateId);
  window.location.assign(url.toString());
}

initOverlayShell();

window.addEventListener(GAME_START_EVENT, () => {
  game?.events.emit("game-start");
});

void (async () => {
  setupBridge({
    onConfigUpdate: applyRuntimeConfig,
    getCurrentConfig: () => latestConfig,
    getCurrentTemplateId: () =>
      getTemplateIdFromUrl() as GameConfig["activeTemplateId"],
    getGame: () => game,
    onLoadTemplate: handleLoadTemplate,
  });

  await ensureGame();

  if (window.parent === window) {
    fetch("./config.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) {
          applyRuntimeConfig(normalizeGameConfig(data, latestConfig));
        }
      })
      .catch(() => {
        applyRuntimeConfig(latestConfig);
      });
  }
})();

export { MAIN_SCENE_KEY };
