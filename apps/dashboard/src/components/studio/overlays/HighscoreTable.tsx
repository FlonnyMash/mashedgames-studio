"use client";

import { useGameLifecycleStore } from "@/store/useGameLifecycleStore";
import type { TemplateOverlayProps } from "./types";
import { overlayTextStyle } from "./overlayTextStyle";

type LeaderboardEntry = {
  name: string;
  score: number;
  highlight?: boolean;
};

function buildLeaderboard(currentScore: number): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [
    { name: "Jordan", score: 140 },
    { name: "Riley", score: 110 },
    { name: "You", score: currentScore, highlight: true },
    { name: "Casey", score: 85 },
    { name: "Morgan", score: 60 },
  ];

  return [...entries].sort((a, b) => b.score - a.score).slice(0, 5);
}

export function HighscoreTable({ config }: TemplateOverlayProps) {
  const score = useGameLifecycleStore((state) => state.score);
  const title = config.highscoreTitle || "Leaderboard";
  const subtitle = config.highscoreSubtitle;
  const accentColor = config.themeColor ?? "#6366f1";
  const entries = buildLeaderboard(score);

  return (
    <section className="w-full">
      <h3
        className="text-base font-semibold"
        style={overlayTextStyle(config, {
          colorKey: "highscoreTitleColor",
          boldKey: "highscoreTitleBold",
          italicKey: "highscoreTitleItalic",
          underlineKey: "highscoreTitleUnderline",
          defaultColor: "#ffffff",
          defaultWeight: "600",
        })}
      >
        {title}
      </h3>
      {subtitle ? (
        <p
          className="mt-1 text-xs"
          style={overlayTextStyle(config, {
            colorKey: "highscoreSubtitleColor",
            boldKey: "highscoreSubtitleBold",
            italicKey: "highscoreSubtitleItalic",
            underlineKey: "highscoreSubtitleUnderline",
            defaultColor: "#a1a1aa",
          })}
        >
          {subtitle}
        </p>
      ) : null}
      <ol className="mt-4 space-y-2">
        {entries.map((entry, index) => (
          <li
            key={`${entry.name}-${index}`}
            className={[
              "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
              entry.highlight
                ? "border border-white/20 bg-white/10"
                : "bg-zinc-800/80",
            ].join(" ")}
          >
            <span className="flex items-center gap-2 text-white">
              <span className="w-5 text-xs font-semibold text-zinc-400">
                {index + 1}
              </span>
              {entry.name}
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ color: entry.highlight ? accentColor : "#e4e4e7" }}
            >
              {entry.score.toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
