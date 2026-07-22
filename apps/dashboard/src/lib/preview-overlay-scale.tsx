"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Fallback logical overlay coordinate space. The live design size is driven by
 * the configured preview resolution; these constants are only used when a
 * caller does not supply explicit dimensions.
 */
export const PREVIEW_OVERLAY_DESIGN_WIDTH = 800;
export const PREVIEW_OVERLAY_DESIGN_HEIGHT = 600;

const SCALE_EPSILON = 0.005;

export function computePreviewOverlayScale(
  width: number,
  height: number,
  designWidth: number = PREVIEW_OVERLAY_DESIGN_WIDTH,
  designHeight: number = PREVIEW_OVERLAY_DESIGN_HEIGHT,
): number {
  if (width < 1 || height < 1 || designWidth < 1 || designHeight < 1) {
    return 1;
  }

  return Math.min(width / designWidth, height / designHeight);
}

export function usePreviewOverlayScale(
  screenRef: RefObject<HTMLElement | null>,
  designWidth: number = PREVIEW_OVERLAY_DESIGN_WIDTH,
  designHeight: number = PREVIEW_OVERLAY_DESIGN_HEIGHT,
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
        designWidth,
        designHeight,
      );
      setScale((current) =>
        Math.abs(current - next) < SCALE_EPSILON ? current : next,
      );
    };

    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();

    return () => observer.disconnect();
  }, [screenRef, designWidth, designHeight]);

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
