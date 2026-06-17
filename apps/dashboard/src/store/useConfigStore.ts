"use client";

import { dashboardMessenger, getBridgePostMessageTargetOrigin } from "@/bridge/messenger";
import {
  applyTemplateConfigDefaults,
  BASELINE_TEMPLATE_ID,
  BRIDGE_MESSAGE_TYPE,
  DEFAULT_GAME_CONFIG,
  GameConfigSchema,
  normalizeTemplateId,
  isLegacyTemplateId,
  type GameConfig,
  type GameTemplateId,
} from "@mashedgames/shared";
import { create } from "state";

const isDev = process.env.NODE_ENV === "development";

function devWarn(label: string, detail: unknown): void {
  if (!isDev) return;
  console.warn(`[useConfigStore] ${label}:`, detail);
}

export interface ConfigStore {
  config: GameConfig;
  selectedTemplateId: GameTemplateId;
  iframeTarget: Window | null;
  engineReady: boolean;
  setConfig: (next: GameConfig) => void;
  patchConfig: (patch: Partial<GameConfig>) => void;
  patchConfigKey: <K extends keyof GameConfig>(
    key: K,
    value: GameConfig[K],
  ) => void;
  setSelectedTemplateId: (id: GameTemplateId) => void;
  setIframeTarget: (win: Window | null) => void;
  setEngineReady: (ready: boolean) => void;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: GameConfigSchema.parse(
    applyTemplateConfigDefaults({
      ...DEFAULT_GAME_CONFIG,
      activeTemplateId: normalizeTemplateId(DEFAULT_GAME_CONFIG.activeTemplateId),
    }),
  ),
  selectedTemplateId: normalizeTemplateId(DEFAULT_GAME_CONFIG.activeTemplateId),
  iframeTarget: null,
  engineReady: false,

  setConfig: (next) => {
    const sanitized = applyTemplateConfigDefaults({
      ...next,
      activeTemplateId: normalizeTemplateId(next.activeTemplateId),
    });
    if (isLegacyTemplateId(next.activeTemplateId)) {
      devWarn(
        "Migrating legacy activeTemplateId",
        `"${next.activeTemplateId}" -> "${BASELINE_TEMPLATE_ID}"`,
      );
    }
    const parsed = GameConfigSchema.safeParse(sanitized);
    if (!parsed.success) {
      devWarn("Rejected setConfig payload", parsed.error.flatten());
      return;
    }
    set({
      config: parsed.data,
      selectedTemplateId: normalizeTemplateId(parsed.data.activeTemplateId),
    });
  },

  patchConfig: (patch) => {
    const merged = applyTemplateConfigDefaults({
      ...get().config,
      ...patch,
      activeTemplateId: normalizeTemplateId(
        patch.activeTemplateId ?? get().config.activeTemplateId,
      ),
    });
    const parsed = GameConfigSchema.safeParse(merged);
    if (!parsed.success) {
      devWarn("Rejected patchConfig payload", parsed.error.flatten());
      return;
    }
    set({
      config: parsed.data,
      selectedTemplateId: normalizeTemplateId(parsed.data.activeTemplateId),
    });
  },

  patchConfigKey: (key, value) => {
    const merged = applyTemplateConfigDefaults({
      ...get().config,
      [key]:
        key === "activeTemplateId"
          ? normalizeTemplateId(value as GameTemplateId)
          : value,
    });
    const parsed = GameConfigSchema.safeParse(merged);
    if (!parsed.success) {
      devWarn("Rejected patchConfigKey", parsed.error.flatten());
      return;
    }
    set({
      config: parsed.data,
      selectedTemplateId: normalizeTemplateId(parsed.data.activeTemplateId),
    });
  },

  setSelectedTemplateId: (id) => {
    const normalizedId = normalizeTemplateId(id);
    if (isLegacyTemplateId(id)) {
      devWarn(
        "Migrating legacy selectedTemplateId",
        `"${id}" -> "${BASELINE_TEMPLATE_ID}"`,
      );
    }
    set((state) => ({
      selectedTemplateId: normalizedId,
      config: {
        ...state.config,
        activeTemplateId: normalizedId,
      },
    }));
  },

  setIframeTarget: (win) => set({ iframeTarget: win }),
  setEngineReady: (ready) => set({ engineReady: ready }),
}));

function postConfigToIframe(config: GameConfig): void {
  const { iframeTarget, engineReady } = useConfigStore.getState();
  if (!iframeTarget || iframeTarget === window) {
    if (isDev && engineReady) {
      devWarn("Skipped UPDATE_CONFIG — iframe contentWindow not bound", null);
    }
    return;
  }

  const parsed = GameConfigSchema.safeParse(config);
  if (!parsed.success) {
    devWarn("Skipped UPDATE_CONFIG — invalid config", parsed.error.flatten());
    return;
  }

  const message = {
    type: BRIDGE_MESSAGE_TYPE.UPDATE_CONFIG,
    payload: parsed.data,
  };
  const targetOrigin = getBridgePostMessageTargetOrigin();

  if (isDev) {
    console.log(
      "[Dashboard Bridge] Sending UPDATE_CONFIG:",
      message.payload,
      "→ iframe",
      targetOrigin,
    );
  }

  iframeTarget.postMessage(message, targetOrigin);
}

let configSyncSequenceId = 0;

useConfigStore.subscribe((state, prev) => {
  if (state.config === prev.config) return;
  postConfigToIframe(state.config);
  const projectId = state.config.projectId;
  if (projectId) {
    dashboardMessenger.sendConfigSync({
      mode: "full",
      config: state.config,
      projectId,
      sequenceId: ++configSyncSequenceId,
      timestamp: Date.now(),
    });
  }
});

export function flushConfigToIframe(): void {
  postConfigToIframe(useConfigStore.getState().config);
}
