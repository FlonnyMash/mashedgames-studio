"use client";

import { useGameLifecycleStore } from "@/store/useGameLifecycleStore";
import type { TemplateOverlayProps } from "./types";
import { HighscoreTable } from "./HighscoreTable";
import { overlayTextStyle } from "./overlayTextStyle";

export function PostGameScreen({
  config,
  messenger,
  disabled,
}: TemplateOverlayProps) {
  const isGameOver = useGameLifecycleStore((state) => state.isGameOver);
  const score = useGameLifecycleStore((state) => state.score);

  const showLeadCapture = config.showLeadCapture !== false;
  const showHighscore = config.showHighscore !== false;

  if (!isGameOver || (!showLeadCapture && !showHighscore)) {
    return null;
  }

  const accentColor = config.themeColor ?? "#6366f1";
  const title = config.leadCaptureTitle || "Great run!";
  const subtitle =
    config.leadCaptureSubtitle || "Enter your details to save your score.";
  const namePlaceholder = config.leadCaptureNamePlaceholder || "Your name";
  const emailPlaceholder =
    config.leadCaptureEmailPlaceholder || "Email address";
  const submitLabel = config.leadCaptureSubmitLabel || "Submit";
  const retryLabel = config.leadCaptureRetryLabel || "Try again";

  const handleTryAgain = () => {
    if (disabled) return;
    const delivered = messenger?.sendEngineControl("START_GAME") ?? false;
    if (!delivered && process.env.NODE_ENV === "development") {
      console.warn(
        "[PostGameScreen] START_GAME not delivered — engine iframe not ready.",
      );
    }
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-6">
      <div className="max-h-[90%] w-full max-w-xs overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        {showLeadCapture ? (
          <div className={showHighscore ? "mb-6" : undefined}>
            <h3
              className="text-base font-semibold"
              style={overlayTextStyle(config, {
                colorKey: "leadCaptureTitleColor",
                boldKey: "leadCaptureTitleBold",
                italicKey: "leadCaptureTitleItalic",
                underlineKey: "leadCaptureTitleUnderline",
                defaultColor: "#ffffff",
                defaultWeight: "600",
              })}
            >
              {title}
            </h3>
            <p
              className="mt-1 text-xs"
              style={overlayTextStyle(config, {
                colorKey: "leadCaptureSubtitleColor",
                boldKey: "leadCaptureSubtitleBold",
                italicKey: "leadCaptureSubtitleItalic",
                underlineKey: "leadCaptureSubtitleUnderline",
                defaultColor: "#a1a1aa",
              })}
            >
              {subtitle}
            </p>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                placeholder={namePlaceholder}
                disabled={disabled}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 disabled:opacity-50"
                style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
              />
              <input
                type="email"
                placeholder={emailPlaceholder}
                disabled={disabled}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 disabled:opacity-50"
                style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
              />
              <button
                type="button"
                disabled={disabled}
                className="w-full rounded-lg py-2 text-sm font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
              >
                <span
                  style={overlayTextStyle(config, {
                    colorKey: "leadCaptureSubmitColor",
                    boldKey: "leadCaptureSubmitBold",
                    italicKey: "leadCaptureSubmitItalic",
                    underlineKey: "leadCaptureSubmitUnderline",
                    defaultColor: "#ffffff",
                    defaultWeight: "600",
                  })}
                >
                  {submitLabel}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        {showHighscore ? <HighscoreTable config={config} messenger={messenger} /> : null}

        <button
          type="button"
          disabled={disabled}
          onClick={handleTryAgain}
          style={overlayTextStyle(config, {
            colorKey: "leadCaptureRetryColor",
            boldKey: "leadCaptureRetryBold",
            italicKey: "leadCaptureRetryItalic",
            underlineKey: "leadCaptureRetryUnderline",
            defaultColor: "#1e293b",
            defaultWeight: "600",
          })}
          className="mt-6 w-full rounded-full bg-white px-8 py-2.5 text-sm shadow-lg transition hover:bg-zinc-100 disabled:opacity-50"
        >
          {retryLabel}
        </button>
      </div>
    </div>
  );
}
