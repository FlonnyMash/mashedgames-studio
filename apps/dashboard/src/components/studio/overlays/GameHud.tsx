"use client";

import { useGameLifecycleStore } from "@/store/useGameLifecycleStore";
import { useEffect, useState } from "react";
import type { TemplateOverlayProps } from "./types";

function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function GameHud({ config }: TemplateOverlayProps) {
  const remainingSeconds = useGameLifecycleStore((state) => state.remainingSeconds);
  const score = useGameLifecycleStore((state) => state.score);
  const isPlaying = useGameLifecycleStore((state) => state.isPlaying);
  const isGameOver = useGameLifecycleStore((state) => state.isGameOver);
  const [localSeconds, setLocalSeconds] = useState(config.gameDurationSeconds);

  const showTimer = config.showCountdownTimer !== false;
  const showScore = config.showHighscore !== false && (isPlaying || isGameOver);

  useEffect(() => {
    if (!isPlaying || isGameOver) {
      setLocalSeconds(config.gameDurationSeconds);
      return;
    }

    if (remainingSeconds !== null) {
      return;
    }

    setLocalSeconds(config.gameDurationSeconds);
    const intervalId = window.setInterval(() => {
      setLocalSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [
    config.gameDurationSeconds,
    isGameOver,
    isPlaying,
    remainingSeconds,
  ]);

  if (!showTimer && !showScore) {
    return null;
  }

  const displaySeconds = remainingSeconds ?? localSeconds;
  const accentColor = config.themeColor ?? "#6366f1";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex items-start justify-between gap-3 px-4">
      {showScore ? (
        <div className="min-w-[5.5rem] rounded-2xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
            {isGameOver ? "Final" : "Score"}
          </p>
          <p
            className="text-lg font-bold tabular-nums leading-tight"
            style={{ color: accentColor }}
          >
            {score.toLocaleString()}
          </p>
        </div>
      ) : (
        <span />
      )}

      {showTimer ? (
        <div className="min-w-[5.5rem] rounded-2xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
            Time
          </p>
          <p
            className="text-lg font-bold tabular-nums leading-tight"
            style={{ color: accentColor }}
            aria-live="polite"
          >
            {formatCountdown(displaySeconds)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
