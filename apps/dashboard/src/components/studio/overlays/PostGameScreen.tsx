"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGameLifecycleStore } from "@/store/useGameLifecycleStore";
import { usePreviewBridgeStore } from "@/lib/preview-bridge-store";
import { getLeadsSubmitUrl } from "@/lib/leads-worker";
import {
  LeadSubmitPayloadSchema,
  normalizePrizeToTier,
  UI_MODULE,
} from "@mashedgames/shared";
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
  const lastReason = useGameLifecycleStore((state) => state.lastReason);
  const supportsUI = usePreviewBridgeStore((state) => state.supportsUI);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // This component stays mounted across rounds, so its local state must be
  // cleared when a new round begins (isGameOver flips back to false). Without
  // this, a prior successful submission keeps `submitted` true forever.
  useEffect(() => {
    if (!isGameOver) {
      setSubmitted(false);
      setName("");
      setEmail("");
    }
  }, [isGameOver]);

  // Manifest is the source of truth: the raw GameConfig `showXxx` flag is
  // only consulted once the template's manifest.supportsUI has confirmed
  // the module is actually supported.
  const showLeadCapture =
    config.showLeadCapture !== false && supportsUI.includes(UI_MODULE.LEAD_CAPTURE);
  const showHighscore =
    config.showHighscore !== false && supportsUI.includes(UI_MODULE.HIGHSCORE);

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

  const handleSubmitLead = async () => {
    if (disabled || isSubmitting || submitted) return;

    // Build against the shared contract so the worker receives exactly what it
    // expects. `gameId` rides in on the flat config; sourceDomain is best-effort
    // context. The engine emits a freeform prize label (`lastReason`, e.g.
    // "10% Off") which is normalized to the strict PrizeTierEnum before it
    // touches the wire — the raw label stays only for on-screen display.
    const candidate = {
      gameId: config.gameId,
      email: email.trim(),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(lastReason ? { prizeTier: normalizePrizeToTier(lastReason) } : {}),
      ...(typeof window !== "undefined"
        ? { sourceDomain: window.location.hostname }
        : {}),
    };

    const parsed = LeadSubmitPayloadSchema.safeParse(candidate);
    if (!parsed.success) {
      if (!config.gameId) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[PostGameScreen] Missing config.gameId — lead capture is not linked to a game.",
          );
        }
        toast.error("Lead capture isn't configured for this game yet.");
      } else {
        toast.error("Please enter a valid email address.");
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(getLeadsSubmitUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        throw new Error(`Leads worker responded with ${response.status}`);
      }

      setSubmitted(true);
      toast.success("Thanks! Your details were submitted.");
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[PostGameScreen] Lead submission failed:", error);
      }
      toast.error("Something went wrong submitting your details. Try again.");
    } finally {
      setIsSubmitting(false);
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
            {submitted ? (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-center text-sm text-emerald-300">
                You&apos;re all set — thanks for playing!
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {lastReason ? (
                  <div
                    className="rounded-lg border px-3 py-2 text-center text-sm font-semibold"
                    style={{
                      borderColor: `${accentColor}59`,
                      backgroundColor: `${accentColor}1f`,
                      color: accentColor,
                    }}
                  >
                    You won: {lastReason}
                  </div>
                ) : null}
                <input
                  type="text"
                  placeholder={namePlaceholder}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={disabled || isSubmitting}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 disabled:opacity-50"
                  style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
                />
                <input
                  type="email"
                  placeholder={emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={disabled || isSubmitting}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus-visible:ring-2 disabled:opacity-50"
                  style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={handleSubmitLead}
                  disabled={disabled || isSubmitting}
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
                    {isSubmitting ? "Submitting..." : submitLabel}
                  </span>
                </button>
              </div>
            )}
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
