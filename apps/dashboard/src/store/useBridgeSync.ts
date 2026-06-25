"use client";

import {
  pushConfigAssetsToPreview,
  pushRuntimeAssetsToPreview,
} from "@/lib/preview-bridge-store";
import { flushConfigToIframe, useConfigStore } from "@/store/useConfigStore";
import { useGameLifecycleStore } from "@/store/useGameLifecycleStore";
import { useTemplateBridgeStore } from "@/store/useTemplateBridgeStore";
import { CONFIG_TEXTURE_FIELD_MAP, type AppMode, type GameTemplateId, GAME_LIFECYCLE_EVENT_TYPE } from "@mashedgames/shared";
import { useEffect, useLayoutEffect, useRef } from "react";

function isIframeDocumentReady(iframe: HTMLIFrameElement): boolean {
  try {
    const doc = iframe.contentDocument;
    return doc?.readyState === "complete";
  } catch {
    // Cross-origin — cannot inspect; rely on the load event.
    return false;
  }
}

function isIframeAboutBlank(iframe: HTMLIFrameElement): boolean {
  try {
    return iframe.contentWindow?.location.href === "about:blank";
  } catch {
    return false;
  }
}

type DashboardMessenger = {
  initSync: (contentWindow: Window | null, templateId: GameTemplateId) => void;
  reactivateAttachedIframe: (
    contentWindow: Window | null,
    templateId: GameTemplateId,
  ) => void;
  sendUpdateConfig: (
    config: ReturnType<typeof useConfigStore.getState>["config"],
  ) => void;
  sendConfigUpdated: (
    config: ReturnType<typeof useConfigStore.getState>["config"],
  ) => void;
  sendLoadTemplate: (templateId: GameTemplateId) => void;
  sendRuntimeAssets?: (assets: Record<string, string>) => void;
  announceHostBridgeReady?: (templateId: GameTemplateId) => void;
  acknowledgeEngineReady?: () => void;
  isEngineReady?: () => boolean;
  setTarget: (contentWindow: Window | null) => void;
  onEngineReady: (
    handler: (payload: { activeTemplateId: GameTemplateId }) => void,
  ) => () => void;
  onGameLifecycleEvent?: (
    handler: (payload: import("@mashedgames/shared").GameLifecycleEventPayload) => void,
  ) => () => void;
};

export interface UseBridgeSyncOptions {
  appMode: AppMode;
  messenger: DashboardMessenger;
  suspended?: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  previewTemplateId: GameTemplateId;
}

function announceHostReady(
  messenger: DashboardMessenger,
  templateId: GameTemplateId,
  iframe: HTMLIFrameElement | null,
): void {
  if (!iframe?.contentWindow || isIframeAboutBlank(iframe)) {
    return;
  }
  messenger.announceHostBridgeReady?.(templateId);
}

export function useBridgeSync({
  appMode,
  messenger,
  suspended = false,
  iframeRef,
  previewTemplateId,
}: UseBridgeSyncOptions): void {
  const previewTemplateIdRef = useRef(previewTemplateId);

  useEffect(() => {
    previewTemplateIdRef.current = previewTemplateId;
  }, [previewTemplateId]);

  useLayoutEffect(() => {
    if (suspended) {
      return;
    }

    const syncEngineReady = (activeTemplateId: GameTemplateId) => {
      const wasReady = useConfigStore.getState().engineReady;
      useConfigStore.getState().setEngineReady(true);
      const contentWindow = iframeRef.current?.contentWindow ?? null;
      useConfigStore.getState().setIframeTarget(contentWindow);
      if (contentWindow) {
        messenger.setTarget(contentWindow);
      }
      if (!wasReady) {
        useTemplateBridgeStore
          .getState()
          .completeTemplateChange(activeTemplateId);
        messenger.reactivateAttachedIframe(
          iframeRef.current?.contentWindow ?? null,
          activeTemplateId,
        );
        previewTemplateIdRef.current = activeTemplateId;
        flushConfigToIframe();
        pushRuntimeAssetsToPreview();
        pushConfigAssetsToPreview(useConfigStore.getState().config);
      }
    };

    const offReady = messenger.onEngineReady((payload) => {
      syncEngineReady(payload.activeTemplateId);
    });

    const offLifecycle = messenger.onGameLifecycleEvent?.((payload) => {
      useGameLifecycleStore.getState().applyEvent(payload);
      if (payload.event === GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_READY) {
        useConfigStore.getState().setEngineReady(true);
        messenger.acknowledgeEngineReady?.();
      }
    });

    if (messenger.isEngineReady?.()) {
      syncEngineReady(previewTemplateIdRef.current);
    }

    announceHostReady(
      messenger,
      previewTemplateIdRef.current,
      iframeRef.current,
    );

    return () => {
      offReady();
      offLifecycle?.();
    };
  }, [iframeRef, messenger, previewTemplateId, suspended]);

  useEffect(() => {
    if (suspended) {
      return;
    }

    let lastTemplateId = previewTemplateIdRef.current;

    const unsubscribeConfig = useConfigStore.subscribe((state, prev) => {
      const templateChanged = state.selectedTemplateId !== lastTemplateId;
      if (templateChanged) {
        lastTemplateId = state.selectedTemplateId;
        previewTemplateIdRef.current = state.selectedTemplateId;
        useTemplateBridgeStore
          .getState()
          .beginTemplateChange(state.selectedTemplateId);
        messenger.sendLoadTemplate(state.selectedTemplateId);
        flushConfigToIframe();
        return;
      }

      const assetFieldKeys = Object.keys(CONFIG_TEXTURE_FIELD_MAP);
      const assetChanged = assetFieldKeys.some(
        (key) =>
          state.config[key as keyof typeof state.config] !==
          prev.config[key as keyof typeof prev.config],
      );
      if (assetChanged) {
        pushConfigAssetsToPreview(state.config);
      }
    });

    const iframe = iframeRef.current;
    if (iframe?.contentWindow && iframe.contentWindow !== window) {
      useConfigStore.getState().setIframeTarget(iframe.contentWindow);
      messenger.setTarget(iframe.contentWindow);
      messenger.reactivateAttachedIframe(
        iframe.contentWindow,
        previewTemplateIdRef.current,
      );
      flushConfigToIframe();
    }

    return () => {
      unsubscribeConfig();
      useConfigStore.getState().setEngineReady(false);
      useConfigStore.getState().setIframeTarget(null);
      messenger.setTarget(null);
    };
  }, [appMode, iframeRef, messenger, previewTemplateId, suspended]);

  useLayoutEffect(() => {
    if (suspended) {
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    const syncAfterIframeLoad = () => {
      const contentWindow = iframe.contentWindow;
      if (!contentWindow || contentWindow === window) {
        return;
      }

      // Same-origin iframes briefly sit on about:blank before the engine URL loads.
      if (isIframeAboutBlank(iframe)) {
        return;
      }

      const handshakeAlreadyComplete = messenger.isEngineReady?.() ?? false;
      const lifecycleReady = useGameLifecycleStore.getState().isGameReady;

      useConfigStore.getState().setIframeTarget(contentWindow);
      messenger.setTarget(contentWindow);

      if (handshakeAlreadyComplete || lifecycleReady) {
        messenger.reactivateAttachedIframe(
          contentWindow,
          previewTemplateIdRef.current,
        );
        if (lifecycleReady) {
          messenger.acknowledgeEngineReady?.();
        }
      } else {
        useConfigStore.getState().setEngineReady(false);
        messenger.initSync(contentWindow, previewTemplateIdRef.current);
      }

      flushConfigToIframe();
      pushRuntimeAssetsToPreview();
      pushConfigAssetsToPreview(useConfigStore.getState().config);
      announceHostReady(messenger, previewTemplateIdRef.current, iframe);
      window.setTimeout(() => {
        flushConfigToIframe();
        pushRuntimeAssetsToPreview();
        pushConfigAssetsToPreview(useConfigStore.getState().config);
        announceHostReady(messenger, previewTemplateIdRef.current, iframe);
      }, 150);
    };

    iframe.addEventListener("load", syncAfterIframeLoad);

    // Cached same-origin engine bundles (Cloudflare demo) can finish loading in
    // the gap before this effect runs — the load event is then never replayed.
    if (isIframeDocumentReady(iframe) && !isIframeAboutBlank(iframe)) {
      queueMicrotask(syncAfterIframeLoad);
    }

    return () => iframe.removeEventListener("load", syncAfterIframeLoad);
  }, [appMode, iframeRef, messenger, previewTemplateId, suspended]);
}
