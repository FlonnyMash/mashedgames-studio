"use client";

import { useState } from "react";
import type { TemplateOverlayProps } from "./types";

export function StartScreen({ config, messenger, disabled }: TemplateOverlayProps) {
  const [dismissed, setDismissed] = useState(false);

  if (config.showStartScreen === false || dismissed) return null;

  const title = config.startScreenTitle || "Play Now";
  const subtitle = config.startScreenSubtitle;
  const cta = config.ctaLabel || "Start";

  const titleColor = config.startScreenTitleColor ?? "#ffffff";
  const titleBold = config.startScreenTitleBold ?? false;
  const titleItalic = config.startScreenTitleItalic ?? false;
  const titleUnderline = config.startScreenTitleUnderline ?? false;
  const subtitleColor = config.startScreenSubtitleColor ?? "#ffffff";
  const subtitleBold = config.startScreenSubtitleBold ?? false;
  const subtitleItalic = config.startScreenSubtitleItalic ?? false;
  const subtitleUnderline = config.startScreenSubtitleUnderline ?? false;
  const ctaTextColor = config.ctaTextColor ?? "#1e293b";
  const ctaBold = config.ctaLabelBold ?? false;
  const ctaItalic = config.ctaLabelItalic ?? false;
  const ctaUnderline = config.ctaLabelUnderline ?? false;

  const handleStart = () => {
    if (disabled) return;
    // Law #6: the command must cross the iframe boundary through the bridge
    // (postMessage ENGINE_CONTROL). A window.dispatchEvent on the host window
    // would never reach the engine. Only dismiss the overlay once the message
    // was actually delivered to the engine iframe.
    const delivered = messenger?.sendEngineControl("START_GAME") ?? false;
    if (!delivered) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[StartScreen] START_GAME not delivered — engine iframe not ready.",
        );
      }
      return;
    }
    setDismissed(true);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 p-6 text-center">
      <h2
        className="text-xl"
        style={{
          color: titleColor,
          fontWeight: titleBold ? "bold" : "600",
          fontStyle: titleItalic ? "italic" : undefined,
          textDecoration: titleUnderline ? "underline" : undefined,
        }}
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className="mt-2 text-sm"
          style={{
            color: subtitleColor,
            fontWeight: subtitleBold ? "bold" : undefined,
            fontStyle: subtitleItalic ? "italic" : undefined,
            textDecoration: subtitleUnderline ? "underline" : undefined,
          }}
        >
          {subtitle}
        </p>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={handleStart}
        style={{
          color: ctaTextColor,
          fontWeight: ctaBold ? "bold" : "600",
          fontStyle: ctaItalic ? "italic" : undefined,
          textDecoration: ctaUnderline ? "underline" : undefined,
        }}
        className="mt-6 rounded-full bg-white px-8 py-2.5 text-sm shadow-lg transition hover:bg-zinc-100 disabled:opacity-50"
      >
        {cta}
      </button>
    </div>
  );
}
