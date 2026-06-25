import {
  AssetReadyPayloadSchema,
  AssetLoadErrorMessageSchema,
  BRIDGE_MESSAGE_TYPE,
  ConfigSyncPayloadSchema,
  ConfigUpdatedMessageSchema,
  EngineControlMessageSchema,
  EngineReadyMessageSchema,
  GameConfigSchema,
  LoadExternalAssetPayloadSchema,
  SetRuntimeAssetsPayloadSchema,
  UpdateConfigMessageSchema,
  isAssetLoadErrorMessage,
  isEngineReadyMessage,
  isGameEventMessage,
  isGameLifecycleEventMessage,
  isLoadTemplateMessage,
  normalizeTemplateId,
  resolveGameEngineBaseUrl,
  type AppMode,
  type AssetLoadErrorPayload,
  type AssetReadyPayload,
  type ConfigSyncPayload,
  type EngineControlAction,
  type GameConfig,
  type GameEventMessage,
  type GameLifecycleEventPayload,
  type GameTemplateId,
  GameLifecycleEventMessageSchema,
  LoadTemplateMessageSchema,
} from "@mashedgames/shared";

const isDev = process.env.NODE_ENV === "development";

function warnIfInvalid(
  schema: {
    safeParse: (
      data: unknown,
    ) =>
      | { success: true }
      | { success: false; error: { flatten: () => unknown } };
  },
  data: unknown,
  label: string,
): void {
  if (!isDev) return;
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(
      `[DashboardMessenger] Invalid ${label}:`,
      result.error.flatten(),
    );
  }
}

const DEV_GAME_ENGINE_URL =
  process.env.NEXT_PUBLIC_GAME_ENGINE_URL ?? "http://localhost:5173";

export function getGameEngineOrigin(): string {
  if (typeof window === "undefined") {
    return new URL(DEV_GAME_ENGINE_URL).origin;
  }

  const base = resolveGameEngineBaseUrl().replace(/\/$/, "");
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return new URL(base).origin;
  }

  return window.location.origin;
}

export function getBridgePostMessageTargetOrigin(): string {
  if (isDev) {
    return "*";
  }
  return getGameEngineOrigin();
}

export function resolveGameEnginePreviewUrl(
  templateId: GameTemplateId,
  appMode: AppMode,
): string {
  const base = resolveGameEngineBaseUrl().replace(/\/$/, "");
  const url =
    base.startsWith("http://") || base.startsWith("https://")
      ? new URL(`${base}/index.html`)
      : new URL(`${base}/index.html`, window.location.origin);
  url.searchParams.set("game", templateId);
  url.searchParams.set("appMode", appMode);
  url.searchParams.set("bridge", "dashboard");
  return url.toString();
}

function isAllowedEngineMessageOrigin(origin: string): boolean {
  if (typeof window !== "undefined" && origin === window.location.origin) {
    return true;
  }
  if (origin === getGameEngineOrigin()) {
    return true;
  }
  if (!isDev) {
    return false;
  }
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function postMessageToIframe(
  targetWindow: Window,
  message: unknown,
  label: string,
): void {
  const targetOrigin = getBridgePostMessageTargetOrigin();
  if (isDev && label === "UPDATE_CONFIG") {
    console.log(
      `[Dashboard Bridge] Sending ${label}:`,
      (message as { payload?: unknown }).payload ?? message,
      "→ iframe",
      targetOrigin,
    );
  }
  targetWindow.postMessage(message, targetOrigin);
}

export const gameEngineOrigin = getGameEngineOrigin();

export function getDashboardAppMode(): AppMode {
  const mode = process.env.NEXT_PUBLIC_APP_MODE;
  return mode === "configurator" ? "configurator" : "studio";
}

class DashboardMessenger {
  private targetWindow: Window | null = null;
  private engineReady = false;
  private expectedTemplateId: GameTemplateId | null = null;
  private pendingConfig: GameConfig | null = null;
  private pendingLoadTemplate: GameTemplateId | null = null;
  private gameEventHandler: ((message: GameEventMessage) => void) | null =
    null;
  private gameLifecycleEventHandler:
    | ((payload: GameLifecycleEventPayload) => void)
    | null = null;
  private assetReadyHandler: ((payload: AssetReadyPayload) => void) | null =
    null;
  private engineReadyHandler:
    | ((payload: { activeTemplateId: GameTemplateId }) => void)
    | null = null;
  private assetLoadErrorHandler: ((payload: AssetLoadErrorPayload) => void) | null =
    null;
  private readonly senderMode: AppMode;

  constructor(senderMode: AppMode = getDashboardAppMode()) {
    this.senderMode = senderMode;
  }

  setTarget(contentWindow: Window | null): void {
    this.targetWindow = contentWindow;
    if (this.engineReady && contentWindow) {
      this.flush();
    }
  }

  initSync(contentWindow: Window | null, templateId: GameTemplateId): void {
    this.engineReady = false;
    this.armIframe(contentWindow, templateId);
  }

  armIframe(contentWindow: Window | null, templateId: GameTemplateId): void {
    this.expectedTemplateId = templateId;
    this.setTarget(contentWindow);
  }

  reactivateAttachedIframe(
    contentWindow: Window | null,
    templateId: GameTemplateId,
  ): void {
    this.expectedTemplateId = templateId;
    this.targetWindow = contentWindow;
    if (!contentWindow) {
      this.engineReady = false;
      return;
    }
    if (this.engineReady) {
      this.flush();
    }
  }

  isEngineReady(): boolean {
    return this.engineReady;
  }

  onIframeNavigation(expectedTemplateId: GameTemplateId): void {
    this.engineReady = false;
    this.targetWindow = null;
    this.expectedTemplateId = expectedTemplateId;
    this.pendingConfig = null;
    this.pendingLoadTemplate = null;
  }

  private acceptsEngineReady(
    event: MessageEvent,
    payload: { activeTemplateId: GameTemplateId },
  ): boolean {
    if (
      this.expectedTemplateId !== null &&
      normalizeTemplateId(payload.activeTemplateId) !==
        normalizeTemplateId(this.expectedTemplateId)
    ) {
      return false;
    }
    if (!(event.source instanceof Window)) {
      return false;
    }
    // Re-bind on every handshake — iframe navigations replace contentWindow.
    this.targetWindow = event.source;
    return true;
  }

  handleWindowMessage(event: MessageEvent): void {
    if (!isAllowedEngineMessageOrigin(event.origin)) return;

    if (isEngineReadyMessage(event.data)) {
      warnIfInvalid(EngineReadyMessageSchema, event.data, "ENGINE_READY");
      if (!this.acceptsEngineReady(event, event.data.payload)) {
        return;
      }
      this.engineReady = true;
      this.engineReadyHandler?.(event.data.payload);
      this.flush();
      return;
    }

    if (isGameEventMessage(event.data)) {
      this.gameEventHandler?.(event.data);
      return;
    }

    if (isGameLifecycleEventMessage(event.data)) {
      warnIfInvalid(
        GameLifecycleEventMessageSchema,
        event.data,
        "GAME_LIFECYCLE_EVENT",
      );
      this.gameLifecycleEventHandler?.(event.data.payload);
      return;
    }

    if (isAssetLoadErrorMessage(event.data)) {
      warnIfInvalid(AssetLoadErrorMessageSchema, event.data, "ASSET_LOAD_ERROR");
      this.assetLoadErrorHandler?.(event.data.payload);
      return;
    }

    if (
      typeof event.data === "object" &&
      event.data !== null &&
      "type" in event.data &&
      event.data.type === BRIDGE_MESSAGE_TYPE.ASSET_READY &&
      "payload" in event.data
    ) {
      const parsed = AssetReadyPayloadSchema.safeParse(
        (event.data as { payload: unknown }).payload,
      );
      if (parsed.success) {
        this.assetReadyHandler?.(parsed.data);
      }
    }
  }

  onEngineReady(
    handler: (payload: { activeTemplateId: GameTemplateId }) => void,
  ): () => void {
    this.engineReadyHandler = handler;
    return () => {
      if (this.engineReadyHandler === handler) {
        this.engineReadyHandler = null;
      }
    };
  }

  onGameEvent(handler: (message: GameEventMessage) => void): () => void {
    this.gameEventHandler = handler;
    return () => {
      if (this.gameEventHandler === handler) {
        this.gameEventHandler = null;
      }
    };
  }

  onGameLifecycleEvent(
    handler: (payload: GameLifecycleEventPayload) => void,
  ): () => void {
    this.gameLifecycleEventHandler = handler;
    return () => {
      if (this.gameLifecycleEventHandler === handler) {
        this.gameLifecycleEventHandler = null;
      }
    };
  }

  onAssetReady(handler: (payload: AssetReadyPayload) => void): () => void {
    this.assetReadyHandler = handler;
    return () => {
      if (this.assetReadyHandler === handler) {
        this.assetReadyHandler = null;
      }
    };
  }

  onAssetLoadError(
    handler: (payload: AssetLoadErrorPayload) => void,
  ): () => void {
    this.assetLoadErrorHandler = handler;
    return () => {
      if (this.assetLoadErrorHandler === handler) {
        this.assetLoadErrorHandler = null;
      }
    };
  }

  sendLoadExternalAsset(key: string, absolutePath: string): void {
    if (!this.targetWindow) return;
    const message = {
      type: BRIDGE_MESSAGE_TYPE.LOAD_EXTERNAL_ASSET,
      payload: { key, absolutePath },
    };
    if (isDev) {
      LoadExternalAssetPayloadSchema.safeParse(message.payload);
    }
    this.targetWindow.postMessage(message, getBridgePostMessageTargetOrigin());
  }

  sendRuntimeAssets(assets: Record<string, string>): void {
    if (!this.targetWindow) return;
    const message = {
      type: BRIDGE_MESSAGE_TYPE.SET_RUNTIME_ASSETS,
      payload: { assets },
    };
    if (isDev) {
      SetRuntimeAssetsPayloadSchema.safeParse(message.payload);
    }
    this.targetWindow.postMessage(message, getBridgePostMessageTargetOrigin());
  }

  sendUpdateConfig(config: GameConfig): void {
    const parsed = GameConfigSchema.safeParse(config);
    if (!parsed.success) {
      devWarn("sendUpdateConfig rejected", parsed.error.flatten());
      return;
    }

    if (!this.targetWindow) {
      this.pendingConfig = parsed.data;
      return;
    }

    this.pendingConfig = null;
    this.postUpdateConfig(parsed.data);
  }

  /** @deprecated Use sendUpdateConfig */
  sendConfigUpdated(config: GameConfig): void {
    this.sendUpdateConfig(config);
  }

  sendGameEvent(event: string, data?: unknown): void {
    if (!this.engineReady || !this.targetWindow) return;
    const message: GameEventMessage = {
      type: BRIDGE_MESSAGE_TYPE.GAME_EVENT,
      event,
      data,
    };
    this.targetWindow.postMessage(message, getBridgePostMessageTargetOrigin());
  }

  sendConfigSync(payload: ConfigSyncPayload): void {
    const parsed = ConfigSyncPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      devWarn("sendConfigSync rejected", parsed.error.flatten());
      return;
    }

    if (!this.engineReady || !this.targetWindow) {
      if (parsed.data.mode === "full") {
        this.pendingConfig = parsed.data.config;
      }
      return;
    }

    const message = {
      type: BRIDGE_MESSAGE_TYPE.CONFIG_UPDATED,
      payload: parsed.data,
    };
    warnIfInvalid(ConfigUpdatedMessageSchema, message, "CONFIG_UPDATED");
    postMessageToIframe(this.targetWindow, message, "CONFIG_UPDATED");
  }

  /**
   * Sends an imperative ENGINE_CONTROL command across the iframe boundary via
   * postMessage. Returns true when the message was actually dispatched to the
   * engine iframe, false when the engine is not ready / not attached — callers
   * must not assume the action happened in that case.
   */
  sendEngineControl(action: EngineControlAction): boolean {
    if (!this.engineReady || !this.targetWindow) {
      devWarn(
        "sendEngineControl dropped — engine iframe not ready",
        { action },
      );
      return false;
    }
    const message = {
      type: BRIDGE_MESSAGE_TYPE.ENGINE_CONTROL,
      payload: { action },
    };
    if (isDev) {
      warnIfInvalid(EngineControlMessageSchema, message, "ENGINE_CONTROL");
    }
    this.targetWindow.postMessage(message, getBridgePostMessageTargetOrigin());
    return true;
  }

  sendLoadTemplate(templateId: GameTemplateId): void {
    this.expectedTemplateId = templateId;
    if (this.engineReady && this.targetWindow) {
      this.postLoadTemplate(templateId);
      return;
    }
    this.pendingLoadTemplate = templateId;
  }

  private flush(): void {
    if (!this.targetWindow) return;

    if (this.pendingLoadTemplate !== null) {
      this.postLoadTemplate(this.pendingLoadTemplate);
      this.pendingLoadTemplate = null;
    }

    if (this.pendingConfig !== null) {
      this.postUpdateConfig(this.pendingConfig);
      this.pendingConfig = null;
    }
  }

  private postUpdateConfig(config: GameConfig): void {
    if (!this.targetWindow || this.targetWindow === window) return;

    const message = {
      type: BRIDGE_MESSAGE_TYPE.UPDATE_CONFIG,
      payload: config,
    };
    warnIfInvalid(UpdateConfigMessageSchema, message, "UPDATE_CONFIG");
    postMessageToIframe(this.targetWindow, message, "UPDATE_CONFIG");
  }

  private postLoadTemplate(templateId: GameTemplateId): void {
    if (!this.targetWindow || this.targetWindow === window) return;

    const message = {
      type: BRIDGE_MESSAGE_TYPE.LOAD_TEMPLATE,
      payload: templateId,
    };
    warnIfInvalid(LoadTemplateMessageSchema, message, "LOAD_TEMPLATE");
    this.targetWindow.postMessage(message, getBridgePostMessageTargetOrigin());
  }
}

function devWarn(label: string, detail: unknown): void {
  if (!isDev) return;
  console.warn(`[DashboardMessenger] ${label}:`, detail);
}

export const dashboardMessenger = new DashboardMessenger();

export function createDashboardMessenger(mode: AppMode): DashboardMessenger {
  return new DashboardMessenger(mode);
}
