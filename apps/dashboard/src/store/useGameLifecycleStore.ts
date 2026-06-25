"use client";

import {
  GAME_LIFECYCLE_EVENT_TYPE,
  type GameLifecycleEventPayload,
} from "@mashedgames/shared";
import { create } from "state";

export interface GameLifecycleStore {
  remainingSeconds: number | null;
  elapsedSeconds: number | null;
  score: number;
  isPlaying: boolean;
  isGameOver: boolean;
  isGameReady: boolean;
  applyEvent: (payload: GameLifecycleEventPayload) => void;
  reset: () => void;
}

const initialState = {
  remainingSeconds: null as number | null,
  elapsedSeconds: null as number | null,
  score: 0,
  isPlaying: false,
  isGameOver: false,
  isGameReady: false,
};

export const useGameLifecycleStore = create<GameLifecycleStore>((set) => ({
  ...initialState,

  applyEvent: (payload) => {
    switch (payload.event) {
      case GAME_LIFECYCLE_EVENT_TYPE.ON_TIMER_UPDATE:
        set({
          remainingSeconds: payload.remaining,
          elapsedSeconds: payload.elapsed,
        });
        break;
      case GAME_LIFECYCLE_EVENT_TYPE.ON_SCORE_UPDATE:
        set({ score: payload.score });
        break;
      case GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_START:
        set({ isPlaying: true, isGameOver: false });
        break;
      case GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_OVER:
        set({
          isPlaying: false,
          isGameOver: true,
          score: payload.finalScore,
          remainingSeconds: 0,
        });
        break;
      case GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_READY:
        set({ ...initialState, isGameReady: true });
        break;
      default:
        break;
    }
  },

  reset: () => set({ ...initialState }),
}));
