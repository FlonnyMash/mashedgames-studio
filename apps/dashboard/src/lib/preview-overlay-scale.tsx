"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

/** Logical overlay coordinate space — matches the dashboard phone mockup design size. */
export const PREVIEW_OVERLAY_DESIGN_WIDTH = 390;
export const PREVIEW_OVERLAY_DESIGN_HEIGHT = 844;

const SCALE_EPSILON = 0.005;

export function computePreviewOverlayScale(
  width: number,
  height: number,
): number {
  if (width < 1 || height < 1) {
    return 1;
  }

  return Math.min(
    width / PREVIEW_OVERLAY_DESIGN_WIDTH,
    height / PREVIEW_OVERLAY_DESIGN_HEIGHT,
  );
}

export function usePreviewOverlayScale(
  screenRef: RefObject<HTMLElement | null>,
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = screenRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      const next = computePreviewOverlayScale(
        element.clientWidth,
        element.clientHeight,
      );
      setScale((current) =>
        Math.abs(current - next) < SCALE_EPSILON ? current : next,
      );
    };

    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();

    return () => observer.disconnect();
  }, [screenRef]);

  return scale;
}

export interface PreviewOverlayRootProps {
  scale: number;
  children: ReactNode;
}

/**
 * Scales host-side HTML overlays (HUD, start screen) to match the game iframe
 * when the preview container is smaller than the design coordinate space.
 * Dashboard overlays use root `rem` units; without this wrapper they stay at
 * browser font size while the Phaser canvas shrinks with the iframe.
 */
export function PreviewOverlayRoot({ scale, children }: PreviewOverlayRootProps) {
  if (scale >= 1 - SCALE_EPSILON) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20">{children}</div>
    );
  }

  const inversePercent = (1 / scale) * 100;
  const scalerStyle: CSSProperties = {
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    width: `${inversePercent}%`,
    height: `${inversePercent}%`,
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className="pointer-events-none h-full w-full" style={scalerStyle}>
        {children}
      </div>
    </div>
  );
}
