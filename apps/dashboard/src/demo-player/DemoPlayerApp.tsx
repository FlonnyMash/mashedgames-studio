import { Toaster } from "sonner";
import { OverlayLayer } from "@/components/studio/overlays/OverlayLayer";
import {
  PreviewOverlayRoot,
  usePreviewOverlayScale,
} from "@/lib/preview-overlay-scale";
import { createDashboardMessenger } from "@/bridge/messenger";
import { usePreviewBridgeStore } from "@/lib/preview-bridge-store";
import { useBridgeSync } from "@/store/useBridgeSync";
import { useConfigStore } from "@/store/useConfigStore";
import type { GameTemplateId } from "@mashedgames/shared";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { DemoConfigPayload } from "./types";

export interface DemoPlayerAppProps {
  payload: DemoConfigPayload;
}

export function DemoPlayerApp({ payload }: DemoPlayerAppProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const messenger = useMemo(() => createDashboardMessenger("studio"), []);
  const overlayScale = usePreviewOverlayScale(
    screenRef,
    payload.config.previewWidth,
    payload.config.previewHeight,
  );

  const templateId = payload.templateId as GameTemplateId;
  const iframeSrc = useMemo(() => {
    // Always load the co-deployed engine bundle on the same origin. Relying on
    // resolveGameEnginePreviewUrl() breaks in the Vite demo shell when dynamic
    // process.env reads compile away and fall back to localhost:5173.
    const url = new URL("./engine/index.html", window.location.href);
    url.searchParams.set("game", templateId);
    url.searchParams.set("appMode", "studio");
    url.searchParams.set("bridge", "standalone");
    return url.toString();
  }, [templateId]);

  useLayoutEffect(() => {
    useConfigStore.getState().setConfig(payload.config);
    useConfigStore.getState().setSelectedTemplateId(templateId);
    usePreviewBridgeStore.getState().setRuntimeAssets(payload.runtimeAssets);
  }, [payload, templateId]);

  useLayoutEffect(() => {
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
  }, [iframeSrc, messenger]);

  useLayoutEffect(() => {
    usePreviewBridgeStore.getState().setMessenger(messenger);

    const onIframeMessage = (event: MessageEvent) => {
      messenger.handleWindowMessage(event);
    };

    window.addEventListener("message", onIframeMessage);

    return () => {
      window.removeEventListener("message", onIframeMessage);
      usePreviewBridgeStore.getState().setMessenger(null);
    };
  }, [messenger]);

  useBridgeSync({
    appMode: "studio",
    messenger,
    iframeRef,
    previewTemplateId: templateId,
  });

  useEffect(() => {
    return () => {
      messenger.setTarget(null);
    };
  }, [messenger]);

  useEffect(() => {
    const screen = screenRef.current;
    const iframe = iframeRef.current;
    if (!screen || !iframe) {
      return;
    }

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
  }, [iframeSrc]);

  return (
    <div className="demo-stage" data-mashed-demo-shell>
      <div ref={screenRef} className="demo-frame">
        <iframe ref={iframeRef} src={iframeSrc} title="Game demo" />
        <PreviewOverlayRoot scale={overlayScale}>
          <OverlayLayer messenger={messenger} />
        </PreviewOverlayRoot>
      </div>
      <Toaster position="top-center" richColors />
    </div>
  );
}
