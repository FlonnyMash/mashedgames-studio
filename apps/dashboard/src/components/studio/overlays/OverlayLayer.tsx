"use client";

import { useConfigStore } from "@/store/useConfigStore";
import { useGameLifecycleStore } from "@/store/useGameLifecycleStore";
import type { createDashboardMessenger } from "@/bridge/messenger";
import { GameHud } from "./GameHud";
import { PostGameScreen } from "./PostGameScreen";
import { StartScreen } from "./StartScreen";
import { useLayoutEffect } from "react";

type DashboardMessenger = ReturnType<typeof createDashboardMessenger>;

export interface OverlayLayerProps {
  messenger: DashboardMessenger;
}

/**
 * Renders all active HTML overlay components inside the phone screen.
 *
 * Subscribes to `useConfigStore` with a whole-config selector so any flat key
 * change (visibility toggles, text, colors, bold/italic/underline) triggers an
 * immediate re-render. Each overlay component self-gates via its own
 * `showXxx` flag and returns null when disabled.
 *
 * `engineReady` is set exclusively when the engine iframe sends ENGINE_READY
 * via postMessage (handled by useBridgeSync → messenger.onEngineReady).  The
 * StartScreen CTA is disabled until that handshake completes, preventing
 * sendEngineControl from silently dropping the START_GAME action.
 */
export function OverlayLayer({ messenger }: OverlayLayerProps) {
  const config = useConfigStore((state) => state.config);
  const engineReady = useConfigStore((state) => state.engineReady);

  useLayoutEffect(() => {
    const offLifecycle = messenger.onGameLifecycleEvent((payload) => {
      useGameLifecycleStore.getState().applyEvent(payload);
    });
    return () => {
      offLifecycle();
      useGameLifecycleStore.getState().reset();
    };
  }, [messenger]);

  return (
    <>
      <GameHud config={config} messenger={messenger} />
      <StartScreen config={config} messenger={messenger} disabled={!engineReady} />
      <PostGameScreen
        config={config}
        messenger={messenger}
        disabled={!engineReady}
      />
    </>
  );
}
