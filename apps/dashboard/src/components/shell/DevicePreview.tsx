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
  THEATER_PHONE_SHADOW_EXPANDED,
  THEATER_PHONE_SHADOW_NORMAL,
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

const PHONE_FRAME_WIDTH = 390;
const PHONE_FRAME_HEIGHT = 844;

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
  const phoneScreenRef = useRef<HTMLDivElement>(null);
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

  const [phoneFrameSize, setPhoneFrameSize] = useState({
    width: PHONE_FRAME_WIDTH,
    height: PHONE_FRAME_HEIGHT,
  });
  const messenger = useMemo(
    () => createDashboardMessenger(appMode),
    [appMode],
  );

  const activeTemplateId = useConfigStore((state) => state.selectedTemplateId);
  const overlayScale = usePreviewOverlayScale(phoneScreenRef);

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

    const screen = phoneScreenRef.current;
    const iframe = iframeRef.current;
    if (!screen || !iframe) return;

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
    observer.observe(screen);

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
  }, [iframeSrc, suspended]);

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const updatePhoneFrameSize = () => {
      const { width, height } = container.getBoundingClientRect();
      const scale = Math.min(
        width / PHONE_FRAME_WIDTH,
        height / PHONE_FRAME_HEIGHT,
        isExpanded ? Number.POSITIVE_INFINITY : 1,
      );
      setPhoneFrameSize({
        width: Math.floor(PHONE_FRAME_WIDTH * scale),
        height: Math.floor(PHONE_FRAME_HEIGHT * scale),
      });
    };

    const observer = new ResizeObserver(updatePhoneFrameSize);
    observer.observe(container);
    updatePhoneFrameSize();

    return () => observer.disconnect();
  }, [isExpanded]);

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
          className={cn(
            "relative shrink-0 transition-all duration-300",
            !isExpanded && "scale-[1.02]",
          )}
          style={{
            width: phoneFrameSize.width,
            height: phoneFrameSize.height,
          }}
        >
          <div
            className={cn(
              "absolute inset-0 rounded-[2.5rem] bg-zinc-900 p-3 transition-all duration-300",
              isExpanded ? THEATER_PHONE_SHADOW_EXPANDED : THEATER_PHONE_SHADOW_NORMAL,
            )}
          >
            <div className="absolute top-0 left-1/2 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-zinc-900" />
            <div
              ref={phoneScreenRef}
              className="relative h-full min-h-0 overflow-hidden rounded-[2rem] bg-black"
            >
              <iframe
                ref={iframeRef}
                src={iframeSrc}
                title="Game preview"
                className="block h-full min-h-[1px] w-full min-w-[1px] border-0"
              />
              <PreviewOverlayRoot scale={overlayScale}>
                <OverlayLayer messenger={messenger} />
              </PreviewOverlayRoot>
              {overlaySlot}
            </div>
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
