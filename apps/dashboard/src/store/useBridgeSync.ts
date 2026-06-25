"use client";

import {
  pushConfigAssetsToPreview,
  pushRuntimeAssetsToPreview,
} from "@/lib/preview-bridge-store";
import { flushConfigToIframe, useConfigStore } from "@/store/useConfigStore";
import { useTemplateBridgeStore } from "@/store/useTemplateBridgeStore";
import { CONFIG_TEXTURE_FIELD_MAP, type AppMode, type GameTemplateId } from "@mashedgames/shared";
import { useEffect, useRef } from "react";

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
  isEngineReady?: () => boolean;
  setTarget: (contentWindow: Window | null) => void;
  onEngineReady: (
    handler: (payload: { activeTemplateId: GameTemplateId }) => void,
  ) => () => void;
};

export interface UseBridgeSyncOptions {
  appMode: AppMode;
  messenger: DashboardMessenger;
  suspended?: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  previewTemplateId: GameTemplateId;
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

  useEffect(() => {
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

    if (messenger.isEngineReady?.()) {
      syncEngineReady(previewTemplateIdRef.current);
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
      offReady();
      unsubscribeConfig();
      useConfigStore.getState().setEngineReady(false);
      useConfigStore.getState().setIframeTarget(null);
      messenger.setTarget(null);
    };
  }, [appMode, iframeRef, messenger, previewTemplateId, suspended]);

  useEffect(() => {
    if (suspended) {
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    const onLoad = () => {
      useConfigStore.getState().setEngineReady(false);
      const contentWindow = iframe.contentWindow;
      useConfigStore.getState().setIframeTarget(contentWindow ?? null);
      messenger.setTarget(contentWindow ?? null);
      messenger.initSync(contentWindow ?? null, previewTemplateIdRef.current);
      flushConfigToIframe();
      pushRuntimeAssetsToPreview();
      pushConfigAssetsToPreview(useConfigStore.getState().config);
      window.setTimeout(() => {
        flushConfigToIframe();
        pushRuntimeAssetsToPreview();
      }, 150);
    };

    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      // Defer until sibling effects (e.g. window "message" listeners) have mounted.
      queueMicrotask(() => {
        onLoad();
      });
    }

    return () => iframe.removeEventListener("load", onLoad);
  }, [appMode, iframeRef, messenger, previewTemplateId, suspended]);
}
