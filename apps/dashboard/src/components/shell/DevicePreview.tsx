"use client";

import {
  createDashboardMessenger,
  gameEngineOrigin,
  getBridgePostMessageTargetOrigin,
  getGameEngineOrigin,
  resolveGameEnginePreviewUrl,
} from "@/bridge/messenger";
import { OverlayLayer } from "@/components/studio/overlays/OverlayLayer";
import {
  PreviewOverlayRoot,
  usePreviewOverlayScale,
} from "@/lib/preview-overlay-scale";
import { usePreviewBridgeStore } from "@/lib/preview-bridge-store";
import {
  EXPAND_BUTTON_CLASSES,
  THEATER_CLOSE_BUTTON_CLASSES,
  THEATER_OVERLAY_CLASSES,
  useTheaterMode,
} from "@/lib/theater-preview-styles";
import { cn } from "@/lib/utils";
import { useBridgeSync } from "@/store/useBridgeSync";
import { useConfigStore } from "@/store/useConfigStore";
import type { AppMode, GameTemplateId } from "@mashedgames/shared";
import { Maximize2, X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type MouseEvent,
  type ReactNode,
} from "react";

export interface DevicePreviewProps {
  appMode: AppMode;
  initialTemplateId: GameTemplateId;
  suspended?: boolean;
  previewSuspended?: boolean;
  overlaySlot?: ReactNode;
}

export function DevicePreview({
  appMode,
  initialTemplateId,
  suspended: suspendedProp = false,
  previewSuspended,
  overlaySlot,
}: DevicePreviewProps) {
  const suspended = previewSuspended ?? suspendedProp;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const { isExpanded, expand, close } = useTheaterMode();

  const handleCloseClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.preventDefault();
      close();
    },
    [close],
  );

  // Configured embed resolution (px). Drives the preview viewport so it mirrors
  // how the game will be embedded on a client site.
  const previewWidth = useConfigStore((state) => state.config.previewWidth);
  const previewHeight = useConfigStore((state) => state.config.previewHeight);

  // Visual fit-to-shrink scale: 1:1 when the resolution fits the panel, scaled
  // down (never up, unless expanded) when it exceeds the available space.
  const [scale, setScale] = useState(1);

  const messenger = useMemo(
    () => createDashboardMessenger(appMode),
    [appMode],
  );

  const activeTemplateId = useConfigStore((state) => state.selectedTemplateId);
  const overlayScale = usePreviewOverlayScale(
    stageRef,
    previewWidth,
    previewHeight,
  );

  const iframeSrc = useMemo(() => {
    return resolveGameEnginePreviewUrl(activeTemplateId, appMode);
  }, [activeTemplateId, appMode]);

  useLayoutEffect(() => {
    if (suspended) {
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    const bindIframeTarget = () => {
      const contentWindow = iframe.contentWindow;
      if (!contentWindow || contentWindow === window) {
        return;
      }
      useConfigStore.getState().setIframeTarget(contentWindow);
      messenger.setTarget(contentWindow);
    };

    bindIframeTarget();
    iframe.addEventListener("load", bindIframeTarget);

    return () => {
      iframe.removeEventListener("load", bindIframeTarget);
      useConfigStore.getState().setIframeTarget(null);
      messenger.setTarget(null);
    };
  }, [iframeSrc, messenger, suspended]);

  useEffect(() => {
    if (initialTemplateId !== useConfigStore.getState().selectedTemplateId) {
      useConfigStore.getState().setSelectedTemplateId(initialTemplateId);
    }
  }, [initialTemplateId]);

  useLayoutEffect(() => {
    if (suspended) {
      return;
    }

    usePreviewBridgeStore.getState().setMessenger(messenger);

    const onIframeMessage = (event: MessageEvent) => {
      messenger.handleWindowMessage(event);
    };

    window.addEventListener("message", onIframeMessage);

    return () => {
      window.removeEventListener("message", onIframeMessage);
      usePreviewBridgeStore.getState().setMessenger(null);
    };
  }, [messenger, suspended]);

  useBridgeSync({
    appMode,
    messenger,
    suspended,
    iframeRef,
    previewTemplateId: activeTemplateId,
  });

  useEffect(() => {
    if (suspended) {
      return;
    }

    return () => {
      messenger.setTarget(null);
    };
  }, [messenger, suspended]);

  useEffect(() => {
    if (suspended) {
      return;
    }

    const stage = stageRef.current;
    const iframe = iframeRef.current;
    if (!stage || !iframe) return;

    const notifyEngineResize = () => {
      try {
        iframe.contentWindow?.dispatchEvent(new Event("resize"));
      } catch {
        /* cross-origin guard */
      }
    };

    const observer = new ResizeObserver(() => {
      notifyEngineResize();
    });
    observer.observe(stage);

    const onLoad = () => {
      notifyEngineResize();
      requestAnimationFrame(notifyEngineResize);
      window.setTimeout(notifyEngineResize, 100);
      window.setTimeout(notifyEngineResize, 400);
    };
    iframe.addEventListener("load", onLoad);
    notifyEngineResize();

    return () => {
      observer.disconnect();
      iframe.removeEventListener("load", onLoad);
    };
  }, [iframeSrc, suspended, previewWidth, previewHeight]);

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const updateScale = () => {
      const { width, height } = container.getBoundingClientRect();
      const next = Math.min(
        width / previewWidth,
        height / previewHeight,
        isExpanded ? Number.POSITIVE_INFINITY : 1,
      );
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };

    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    updateScale();

    return () => observer.disconnect();
  }, [isExpanded, previewWidth, previewHeight]);

  return (
    <div
      className={cn(
        "transition-all duration-300",
        isExpanded
          ? THEATER_OVERLAY_CLASSES
          : "relative flex min-h-0 flex-1 overflow-hidden p-4",
      )}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isExpanded ? (
        <div
          className="pointer-events-none absolute inset-0 bg-black/85 backdrop-blur-md"
          aria-hidden
        />
      ) : null}

      {isExpanded ? (
        <button
          type="button"
          onClick={handleCloseClick}
          className={THEATER_CLOSE_BUTTON_CLASSES}
          aria-label="Close fullscreen preview"
        >
          <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}

      <div
        ref={previewContainerRef}
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden transition-all duration-300",
          isExpanded ? "h-full w-full p-6 sm:p-10" : "",
        )}
      >
        {!isExpanded ? (
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
          className="relative shrink-0"
          style={{
            width: Math.floor(previewWidth * scale),
            height: Math.floor(previewHeight * scale),
          }}
        >
          <div
            ref={stageRef}
            className="absolute top-0 left-0 origin-top-left overflow-hidden rounded-lg bg-black shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/10"
            style={{
              width: previewWidth,
              height: previewHeight,
              transform: `scale(${scale})`,
            }}
          >
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              title="Game preview"
              className="block h-full min-h-px w-full min-w-px border-0"
            />
            <PreviewOverlayRoot scale={overlayScale}>
              <OverlayLayer messenger={messenger} />
            </PreviewOverlayRoot>
            {overlaySlot}
          </div>
        </div>
      </div>
    </div>
  );
}

export {
  getBridgePostMessageTargetOrigin,
  getGameEngineOrigin,
  gameEngineOrigin,
  resolveGameEnginePreviewUrl,
};
