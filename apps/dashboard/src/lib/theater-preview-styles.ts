"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export const THEATER_CONTROL_BASE =
  "rounded-full backdrop-blur-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";

export const EXPAND_BUTTON_CLASSES = cn(
  THEATER_CONTROL_BASE,
  "bg-black/10 p-2 text-zinc-900 hover:bg-black/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20",
);

export const CLOSE_BUTTON_CLASSES = cn(
  THEATER_CONTROL_BASE,
  "bg-black/10 p-2.5 text-zinc-900 hover:bg-black/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20",
);

/** Fullscreen theater backdrop — above storefront detail dialog (z-50). */
export const THEATER_OVERLAY_CLASSES =
  "fixed inset-0 z-[200] flex items-center justify-center overflow-hidden p-4 sm:p-6";

/** Premium fade + scale entry for theater stage content. */
export const THEATER_STAGE_TRANSITION =
  "transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,transform]";

export const THEATER_STAGE_ENTER_CLASSES = cn(
  THEATER_STAGE_TRANSITION,
  "opacity-100 scale-100",
);

export const THEATER_STAGE_EXIT_CLASSES = cn(
  THEATER_STAGE_TRANSITION,
  "opacity-0 scale-95",
);

/** Close control for dark theater overlay. */
export const THEATER_CLOSE_BUTTON_CLASSES = cn(
  THEATER_CONTROL_BASE,
  "fixed top-4 right-4 z-[210] bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:ring-white/50 focus-visible:ring-offset-zinc-950",
);

export const THEATER_PHONE_SHADOW_NORMAL =
  "shadow-[0_32px_64px_-16px_rgba(0,0,0,0.45)]";

export const THEATER_PHONE_SHADOW_EXPANDED =
  "shadow-[0_40px_80px_-20px_rgba(0,0,0,0.55)]";

export function useTheaterMode() {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setIsExpanded(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isExpanded]);

  return {
    isExpanded,
    setIsExpanded,
    expand: () => setIsExpanded(true),
    close: () => setIsExpanded(false),
  };
}
