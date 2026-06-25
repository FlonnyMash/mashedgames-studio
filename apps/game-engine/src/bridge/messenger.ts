import {
  BRIDGE_MESSAGE_TYPE,
  BridgeMessageSchema,
  ConfigSyncPayloadSchema,
  GAME_LIFECYCLE_EVENT_TYPE,
  GameConfigSchema,
  GameLifecycleEventPayloadSchema,
  LoadExternalAssetPayloadSchema,
  SetRuntimeAssetsPayloadSchema,
  type AssetLoadErrorPayload,
  type EngineControlAction,
  type GameConfig,
  type GameLifecycleEventPayload,
  type GameTemplateId,
} from "@mashedgames/shared";
import { loadExternalAsset } from "./external-asset-loader.ts";
import { setRuntimeAssets } from "./runtime-assets.ts";
import type Phaser from "phaser";
import { getEngineMode } from "../env/app-mode.ts";
import {
  getParentTargetOrigin,
  isAllowedDashboardOrigin,
} from "./dashboard-origin.ts";

export type EngineBridgeHandlers = {
  onConfigUpdate: (config: GameConfig) => void;
  getCurrentConfig: () => GameConfig;
  getCurrentTemplateId: () => GameTemplateId;
  getGame: () => Phaser.Game | null;
  onLoadTemplate?: (templateId: string) => void;
};

let currentTemplateId: GameTemplateId = "default";

/** Materialized Cloudflare demo shell: React host + engine iframe on one origin. */
export function isStandaloneBridge(): boolean {
  const bridge = new URLSearchParams(window.location.search).get("bridge");
  if (bridge === "standalone") return true;
  if (bridge === "dashboard") return false;

  if (window.parent === window) {
    return false;
  }

  try {
    return (
      window.parent.location.origin === window.location.origin &&
      window.parent.document.querySelector("[data-mashed-demo-shell]") != null
    );
  } catch {
    return false;
  }
}

function resolveOutboundBridgeTarget(): { target: Window; origin: string } | null {
  const standalone = isStandaloneBridge();

  if (standalone) {
    const target = window.parent !== window ? window.parent : window;
    return { target, origin: window.location.origin };
  }

  if (window.parent === window) {
    return null;
  }

  return { target: window.parent, origin: getParentTargetOrigin() };
}

function isAllowedInboundMessageSource(source: MessageEventSource | null): boolean {
  if (!source) {
    return false;
  }

  if (isStandaloneBridge()) {
    return source === window.parent || source === window;
  }

  return source === window.parent;
}

export class EngineMessenger {
  private configListeners = new Set<(config: GameConfig) => void>();
  private handlers: EngineBridgeHandlers | null = null;
  private started = false;
  private boundListener: ((event: MessageEvent) => void) | null = null;
  private standaloneReadyRetryTimers: number[] = [];
  private standaloneLifecycleRetryTimers: number[] = [];
  private hostConfigReceived = false;
  private hostBridgeReceived = false;
  private phaserBooted = false;
  private pendingGameReadyLifecycle: GameLifecycleEventPayload | null = null;

  start(handlers: EngineBridgeHandlers): void {
    if (this.started) return;
    this.started = true;
    this.handlers = handlers;
    currentTemplateId = handlers.getCurrentTemplateId();

    this.boundListener = (event: MessageEvent) => {
      this.handleMessage(event);
    };
    window.addEventListener("message", this.boundListener);
  }

  onConfigUpdate(listener: (config: GameConfig) => void): () => void {
    this.configListeners.add(listener);
    return () => {
      this.configListeners.delete(listener);
    };
  }

  sendEngineReady(): void {
    if (isStandaloneBridge()) {
      if (!this.phaserBooted || !this.hasHostHandshake()) {
        return;
      }
    }

    this.postEngineReady();
    if (isStandaloneBridge()) {
      this.scheduleEngineReadyRetries([50, 150, 400, 1000, 2000, 4000, 8000]);
    } else {
      this.scheduleEngineReadyRetries([150, 600, 1200]);
    }
  }

  /** Called from main.ts once Phaser fires its "ready" event. */
  notifyPhaserBooted(): void {
    this.phaserBooted = true;
    this.sendEngineReady();
    this.resendGameLifecycleReadyIfBooted();
  }

  private hasHostHandshake(): boolean {
    return this.hostConfigReceived || this.hostBridgeReceived;
  }

  private notifyHostHandshake(): void {
    this.sendEngineReady();
    this.resendGameLifecycleReadyIfBooted();
  }

  private markHostConfigReceived(): void {
    this.hostConfigReceived = true;
    this.notifyHostHandshake();
  }

  private markHostBridgeReceived(): void {
    this.hostBridgeReceived = true;
    this.notifyHostHandshake();
  }

  private postEngineReady(): void {
    const outbound = resolveOutboundBridgeTarget();
    if (!outbound) return;

    const handlers = this.handlers;
    outbound.target.postMessage(
      {
        type: BRIDGE_MESSAGE_TYPE.ENGINE_READY,
        payload: {
          activeTemplateId: handlers?.getCurrentTemplateId() ?? currentTemplateId,
          appMode: getEngineMode(),
        },
      },
      outbound.origin,
    );
  }

  private clearEngineReadyRetries(): void {
    for (const timerId of this.standaloneReadyRetryTimers) {
      window.clearTimeout(timerId);
    }
    this.standaloneReadyRetryTimers = [];
  }

  private scheduleEngineReadyRetries(
    delaysMs: number[] = [50, 150, 400],
  ): void {
    this.clearEngineReadyRetries();
    for (const delayMs of delaysMs) {
      const timerId = window.setTimeout(() => {
        this.postEngineReady();
      }, delayMs);
      this.standaloneReadyRetryTimers.push(timerId);
    }
  }


  sendAssetLoadError(payload: AssetLoadErrorPayload): void {
    const outbound = resolveOutboundBridgeTarget();
    if (!outbound) return;

    outbound.target.postMessage(
      {
        type: BRIDGE_MESSAGE_TYPE.ASSET_LOAD_ERROR,
        payload,
      },
      outbound.origin,
    );
  }

  sendGameLifecycleEvent(payload: GameLifecycleEventPayload): void {
    const parsed = GameLifecycleEventPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }

    if (
      isStandaloneBridge() &&
      parsed.data.event === GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_READY &&
      !this.hasHostHandshake()
    ) {
      this.pendingGameReadyLifecycle = parsed.data;
      return;
    }

    this.postGameLifecycleEvent(parsed.data);
  }

  private postGameLifecycleEvent(payload: GameLifecycleEventPayload): void {
    const outbound = resolveOutboundBridgeTarget();
    if (!outbound) return;

    outbound.target.postMessage(
      {
        type: BRIDGE_MESSAGE_TYPE.GAME_LIFECYCLE_EVENT,
        payload,
      },
      outbound.origin,
    );
  }

  private clearGameLifecycleReadyRetries(): void {
    for (const timerId of this.standaloneLifecycleRetryTimers) {
      window.clearTimeout(timerId);
    }
    this.standaloneLifecycleRetryTimers = [];
  }

  private scheduleGameLifecycleReadyRetries(
    payload: GameLifecycleEventPayload,
    delaysMs: number[] = [50, 150, 400, 1000, 2000],
  ): void {
    this.clearGameLifecycleReadyRetries();
    for (const delayMs of delaysMs) {
      const timerId = window.setTimeout(() => {
        this.postGameLifecycleEvent(payload);
      }, delayMs);
      this.standaloneLifecycleRetryTimers.push(timerId);
    }
  }

  private resendGameLifecycleReadyIfBooted(): void {
    if (!this.phaserBooted || !this.hasHostHandshake()) {
      return;
    }

    const payload =
      this.pendingGameReadyLifecycle ?? {
        event: GAME_LIFECYCLE_EVENT_TYPE.ON_GAME_READY,
        timestamp: Date.now(),
      };
    this.pendingGameReadyLifecycle = null;
    this.postGameLifecycleEvent(payload);
    if (isStandaloneBridge()) {
      this.scheduleGameLifecycleReadyRetries(payload);
    }
  }

  private notifyConfigUpdate(config: GameConfig): void {
    for (const listener of this.configListeners) {
      listener(config);
    }
    this.handlers?.onConfigUpdate(config);
  }

  private handleMessage(event: MessageEvent): void {
    if (!isAllowedInboundMessageSource(event.source)) {
      console.log("[Engine Bridge] rejected message source");
      return;
    }
    if (!isAllowedDashboardOrigin(event.origin)) {
      console.log("[Engine Bridge] rejected origin", event.origin);
      return;
    }

    const parsedMessage = BridgeMessageSchema.safeParse(event.data);
    if (!parsedMessage.success) {
      return;
    }
    const message = parsedMessage.data;

    if (message.type === BRIDGE_MESSAGE_TYPE.ENGINE_CONTROL) {
      console.log("[Engine Bridge] inbound message", message.type, message.payload);
      this.handleEngineControl(message.payload.action);
      return;
    }

    if (message.type === BRIDGE_MESSAGE_TYPE.HOST_READY) {
      this.markHostBridgeReceived();
      return;
    }

    const handlers = this.handlers;
    if (!handlers) return;

    switch (message.type) {
      case BRIDGE_MESSAGE_TYPE.UPDATE_CONFIG: {
        const parsed = GameConfigSchema.safeParse(message.payload);
        if (!parsed.success) {
          return;
        }
        this.notifyConfigUpdate(parsed.data);
        const game = handlers.getGame();
        if (game) {
          game.events.emit("bridge:config-update", parsed.data);
        }
        this.markHostConfigReceived();
        break;
      }
      case BRIDGE_MESSAGE_TYPE.LOAD_TEMPLATE: {
        currentTemplateId = message.payload;
        if (handlers.onLoadTemplate) {
          handlers.onLoadTemplate(message.payload);
        } else {
          this.sendEngineReady();
        }
        break;
      }
      case BRIDGE_MESSAGE_TYPE.LOAD_EXTERNAL_ASSET: {
        const parsed = LoadExternalAssetPayloadSchema.safeParse(message.payload);
        if (!parsed.success) break;
        const game = handlers.getGame();
        if (!game) break;
        loadExternalAsset(
          game,
          parsed.data.key,
          parsed.data.absolutePath,
          handlers.getCurrentConfig().projectId,
        );
        break;
      }
      case BRIDGE_MESSAGE_TYPE.SET_RUNTIME_ASSETS: {
        const parsed = SetRuntimeAssetsPayloadSchema.safeParse(message.payload);
        if (!parsed.success) break;
        setRuntimeAssets(parsed.data.assets);
        this.markHostConfigReceived();
        break;
      }
      case BRIDGE_MESSAGE_TYPE.CONFIG_UPDATED: {
        const parsed = ConfigSyncPayloadSchema.safeParse(message.payload);
        if (!parsed.success) break;
        let nextConfig: GameConfig;
        if (parsed.data.mode === "full") {
          nextConfig = parsed.data.config;
        } else {
          const merged = { ...handlers.getCurrentConfig(), ...parsed.data.fields };
          const validated = GameConfigSchema.safeParse(merged);
          if (!validated.success) break;
          nextConfig = validated.data;
        }
        this.notifyConfigUpdate(nextConfig);
        const game = handlers.getGame();
        if (game) {
          game.events.emit("bridge:config-update", nextConfig);
        }
        this.markHostConfigReceived();
        break;
      }
      default:
        break;
    }
  }

  private handleEngineControl(action: EngineControlAction): void {
    console.log("[Engine Bridge] handleEngineControl", action);

    // Broadcast as a DOM CustomEvent so any non-Phaser listener can react.
    window.dispatchEvent(new CustomEvent("engine:control", { detail: { action } }));

    // Canonical local trigger consumed by main.ts.
    if (action === "START_GAME") {
      window.dispatchEvent(new CustomEvent("GAME_START"));
      // Back-compat for older template bundles that still listen for the
      // legacy ENGINE_START_GAME DOM event name.
      window.dispatchEvent(new CustomEvent("ENGINE_START_GAME"));
    }

    // Also route through the Phaser game event bus so scenes can listen with
    // `this.game.events.on("bridge:control", handler)` without coupling to DOM.
    const game = this.handlers?.getGame();
    if (game) {
      game.events.emit("bridge:control", action);
    }
  }
}

export const engineMessenger = new EngineMessenger();

export function setupBridge(handlers: EngineBridgeHandlers): void {
  engineMessenger.start(handlers);
  // ENGINE_READY is sent only once the Phaser game fires its own "ready" event
  // (see main.ts game.events.once("ready", ...)).  Sending it here — before the
  // game object even exists — produces a premature handshake that the dashboard
  // immediately invalidates via useBridgeSync's onLoad → initSync() reset,
  // leaving messenger.engineReady === false until the second ENGINE_READY
  // arrives.  That race is the source of the "sendEngineControl dropped" bug.
}

export function setBridgeTemplateId(id: GameTemplateId): void {
  currentTemplateId = id;
}
