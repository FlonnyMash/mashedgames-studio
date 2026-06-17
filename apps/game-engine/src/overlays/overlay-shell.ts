import {
  GAME_LIFECYCLE_EVENT_TYPE,
  type GameConfig,
  type GameLifecycleEventPayload,
} from "@mashedgames/shared";
import type { Game } from "phaser";
import { engineMessenger } from "../bridge/messenger.ts";

const LIFECYCLE_BRIDGE_KEY = "lifecycleBridgeBound";

let overlayRoot: HTMLElement | null = null;

function getOverlayRoot(): HTMLElement {
  if (!overlayRoot) {
    overlayRoot = document.getElementById("ui-layer");
  }
  if (!overlayRoot) {
    throw new Error("Missing #ui-layer overlay mount point.");
  }
  return overlayRoot;
}

export function initOverlayShell(): void {
  const root = getOverlayRoot();
  if (root.dataset.mounted === "true") {
    return;
  }
  root.dataset.mounted = "true";
  root.className = "pointer-events-none absolute inset-0 z-10";
}

export function applyOverlayConfig(config: GameConfig): void {
  initOverlayShell();
  const root = getOverlayRoot();
  root.style.setProperty("--theme-color", config.themeColor);
  document.documentElement.style.setProperty("--theme-color", config.themeColor);
}

function forwardLifecycleEvent(payload: GameLifecycleEventPayload): void {
  engineMessenger.sendGameLifecycleEvent(payload);
}

/**
 * Forwards template scene lifecycle events to the dashboard via GAME_LIFECYCLE_EVENT.
 * Templates emit on `game.events` (see CatchGameScene.emitLifecycle).
 */
export function bindSceneLifecycleBridge(game: Game): void {
  if (game.registry.get(LIFECYCLE_BRIDGE_KEY)) {
    game.events.emit("lifecycle-bridge-ready");
    return;
  }
  game.registry.set(LIFECYCLE_BRIDGE_KEY, true);

  game.events.on("game-ready", (data: { timestamp?: number }) => {
    forwardLifecycleEvent({
      event: GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_READY,
      timestamp: data?.timestamp ?? Date.now(),
    });
  });

  game.events.on("game-start", (data: { timestamp?: number }) => {
    forwardLifecycleEvent({
      event: GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_START,
      timestamp: data?.timestamp ?? Date.now(),
    });
  });

  game.events.on("score-update", (data: { score: number; delta?: number }) => {
    forwardLifecycleEvent({
      event: GAME_LIFECYCLE_EVENT_TYPE.ON_SCORE_UPDATE,
      score: data.score,
      delta: data.delta,
    });
  });

  game.events.on("timer-update", (data: { remaining: number; elapsed: number }) => {
    forwardLifecycleEvent({
      event: GAME_LIFECYCLE_EVENT_TYPE.ON_TIMER_UPDATE,
      remaining: data.remaining,
      elapsed: data.elapsed,
    });
  });

  game.events.on("game-over", (data: { finalScore: number; reason?: string }) => {
    forwardLifecycleEvent({
      event: GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_OVER,
      finalScore: data.finalScore,
      reason: data.reason,
    });
  });

  game.events.emit("lifecycle-bridge-ready");
}
