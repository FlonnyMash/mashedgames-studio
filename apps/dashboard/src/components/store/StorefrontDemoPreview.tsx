"use client";

import {
  EXPAND_BUTTON_CLASSES,
  THEATER_OVERLAY_CLASSES,
  THEATER_PHONE_SHADOW_EXPANDED,
  THEATER_PHONE_SHADOW_NORMAL,
  THEATER_STAGE_ENTER_CLASSES,
  THEATER_STAGE_EXIT_CLASSES,
  useTheaterMode,
} from "@/lib/theater-preview-styles";
import { cn } from "@/lib/utils";
import type { TemplateControlEntry } from "@mashedgames/shared";
import { ChevronLeft, Keyboard, Maximize2, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

type StorefrontDemoPreviewProps = {
  children: ReactNode;
  posterUrl?: string | null;
  posterAlt?: string;
  isExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  showExpandControl?: boolean;
  posterLayout?: "landscape" | "portrait";
  /** Label for the unified back control in theater mode. */
  backLabel?: string;
  /** Primary CTA and related actions rendered below the viewport in theater mode. */
  theaterFooter?: ReactNode;
  /** Key-action hints for the controls popover. Hidden when empty. */
  controls?: TemplateControlEntry[];
};

function stopTheaterEvent(event: MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}

function DemoControlsPopover({ controls }: { controls: TemplateControlEntry[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          stopTheaterEvent(event);
          setOpen((value) => !value);
        }}
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        )}
        aria-label="Show controls"
        aria-expanded={open}
      >
        <Keyboard className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Controls"
          className="absolute bottom-full left-1/2 z-30 mb-3 w-64 -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Controls
          </p>
          <ul className="space-y-2.5">
            {controls.map((entry, index) => (
              <li
                key={`${entry.key}-${entry.action}-${index}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="font-mono text-xs text-zinc-300">{entry.key}</span>
                <span className="text-right text-zinc-400">{entry.action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Storefront demo shell with Theater Mode. The phone frame (and iframe) stay in
 * one DOM node — only wrapper classes change so the game session is preserved.
 */
export function StorefrontDemoPreview({
  children,
  posterUrl,
  posterAlt = "Game preview",
  isExpanded: controlledExpanded,
  onExpandChange,
  showExpandControl = true,
  posterLayout = "portrait",
  backLabel = "Back to template",
  theaterFooter,
  controls = [],
}: StorefrontDemoPreviewProps) {
  const internal = useTheaterMode();
  const isExpanded = controlledExpanded ?? internal.isExpanded;
  const [stageEntered, setStageEntered] = useState(false);
  const showControls = controls.length > 0;

  const setExpanded = useCallback(
    (next: boolean) => {
      if (onExpandChange) {
        onExpandChange(next);
      } else if (next) {
        internal.expand();
      } else {
        internal.close();
      }
    },
    [internal, onExpandChange],
  );

  const expand = useCallback(() => setExpanded(true), [setExpanded]);
  const close = useCallback(() => setExpanded(false), [setExpanded]);

  const handleCloseClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      stopTheaterEvent(event);
      close();
    },
    [close],
  );

  const hasPoster = Boolean(posterUrl?.trim());
  const isLandscapePoster = posterLayout === "landscape";

  useEffect(() => {
    if (!isExpanded) {
      setStageEntered(false);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setStageEntered(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setExpanded(false);
    };

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isExpanded, setExpanded]);

  return (
    <div className="relative w-full" onClick={(event) => event.stopPropagation()}>
      {!isExpanded && hasPoster ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            expand();
          }}
          className={cn(
            "group relative max-w-full overflow-hidden rounded-2xl ring-1 ring-white/20 transition-all duration-300",
            "hover:ring-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
            THEATER_PHONE_SHADOW_NORMAL,
            isLandscapePoster
              ? "inline-block"
              : "mx-auto aspect-[9/16] max-w-[260px] scale-[1.02] hover:scale-[1.04]",
          )}
          aria-label="Play interactive demo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={posterUrl!}
            alt={posterAlt}
            className={cn(
              "block transition-transform duration-300 group-hover:scale-[1.02]",
              isLandscapePoster
                ? "max-h-[min(40vh,400px)] w-auto max-w-full"
                : "h-full w-full object-cover",
            )}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/50 via-transparent to-transparent" />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-zinc-900 shadow-xl transition-transform duration-300 group-hover:scale-110 sm:h-16 sm:w-16">
              <Play className="h-6 w-6 fill-current pl-0.5 sm:h-7 sm:w-7" aria-hidden />
            </span>
          </span>
        </button>
      ) : null}

      <div
        role={isExpanded ? "dialog" : undefined}
        aria-modal={isExpanded ? true : undefined}
        aria-label={isExpanded ? "Interactive demo fullscreen" : undefined}
        className={cn(
          isExpanded
            ? THEATER_OVERLAY_CLASSES
            : hasPoster
              ? "pointer-events-none fixed inset-0 z-[-1] flex items-center justify-center opacity-0"
              : "relative mx-auto w-full",
        )}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {isExpanded ? (
          <>
            {hasPoster ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={posterUrl!}
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-3xl"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.88)_55%,rgba(0,0,0,0.94)_100%)]"
                  aria-hidden
                />
              </>
            ) : (
              <div
                className="pointer-events-none absolute inset-0 bg-zinc-950"
                aria-hidden
              />
            )}

            <button
              type="button"
              onClick={handleCloseClick}
              className={cn(
                "absolute left-4 top-4 z-[210] inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                stageEntered ? THEATER_STAGE_ENTER_CLASSES : THEATER_STAGE_EXIT_CLASSES,
              )}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
              {backLabel}
            </button>
          </>
        ) : null}

        {!isExpanded && showExpandControl && !hasPoster ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              expand();
            }}
            className={cn("absolute top-2 right-2 z-20", EXPAND_BUTTON_CLASSES)}
            aria-label="Expand preview to fullscreen"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}

        <div
          className={cn(
            "relative flex flex-col items-center",
            isExpanded &&
              "z-10 max-h-dvh w-full max-w-[min(92vw,560px)] gap-4",
            isExpanded &&
              (stageEntered ? THEATER_STAGE_ENTER_CLASSES : THEATER_STAGE_EXIT_CLASSES),
          )}
        >
          <div
            className={cn(
              "relative mx-auto aspect-[9/16] shrink-0 overflow-hidden rounded-[2.5rem] bg-black ring-8 ring-slate-800",
              isExpanded
                ? cn(
                    "h-[min(calc(100dvh-7rem),calc((100vw-2rem)*16/9))] w-auto max-w-[min(92vw,calc((100dvh-7rem)*9/16))]",
                    THEATER_PHONE_SHADOW_EXPANDED,
                  )
                : cn(
                    "w-full max-w-[min(100%,340px)] transition-all duration-300",
                    !hasPoster && "scale-[1.02]",
                    THEATER_PHONE_SHADOW_NORMAL,
                  ),
            )}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {children}
          </div>

          {isExpanded ? (
            <div className="pointer-events-none flex shrink-0 items-center justify-center gap-3 px-2">
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
                {theaterFooter}
                {showControls ? <DemoControlsPopover controls={controls} /> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
