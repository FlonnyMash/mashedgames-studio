import {
  applyTemplateConfigDefaults,
  DEFAULT_GAME_CONFIG,
  exportClientPayload,
  GameConfigSchema,
  normalizeTemplateId,
  patchFlatConfig,
  patchTemplateField as patchTemplateFieldValue,
  type GameConfig,
} from "@mashedgames/shared";
import { create } from "state";

export interface StudioConfigStore {
  config: GameConfig;
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  patchConfig: <K extends keyof GameConfig>(
    key: K,
    value: GameConfig[K],
  ) => void;
  patchTemplateField: (key: string, value: string | number | boolean) => void;
  resetConfig: () => void;
  exportConfig: () => GameConfig;
  hydrateConfig: (config: GameConfig) => void;
}

function toStudioConfig(config: GameConfig): GameConfig {
  const parsed = GameConfigSchema.safeParse(
    applyTemplateConfigDefaults({ ...config, appMode: "studio" }),
  );
  return parsed.success ? parsed.data : applyTemplateConfigDefaults(config);
}

export const useStudioConfigStore = create<StudioConfigStore>((set, get) => ({
  config: toStudioConfig(DEFAULT_GAME_CONFIG),
  selectedTemplateId: normalizeTemplateId(DEFAULT_GAME_CONFIG.activeTemplateId),

  setSelectedTemplateId: (id) => {
    const normalized = normalizeTemplateId(id);
    set({
      selectedTemplateId: normalized,
      config: toStudioConfig({
        ...get().config,
        activeTemplateId: normalized,
      }),
    });
  },

  patchConfig: (key, value) => {
    const merged = patchFlatConfig(get().config, key, value);
    const parsed = GameConfigSchema.safeParse(merged);
    if (!parsed.success) {
      return;
    }
    set({ config: toStudioConfig(parsed.data) });
  },

  patchTemplateField: (key, value) => {
    const merged = patchTemplateFieldValue(get().config, key, value);
    const parsed = GameConfigSchema.safeParse(merged);
    if (!parsed.success) {
      return;
    }
    set({ config: toStudioConfig(parsed.data) });
  },

  resetConfig: () => {
    const templateId = get().selectedTemplateId;
    set({
      config: toStudioConfig({
        ...DEFAULT_GAME_CONFIG,
        activeTemplateId: templateId,
      }),
      selectedTemplateId: templateId,
    });
  },

  exportConfig: () => exportClientPayload(get().config),

  hydrateConfig: (config) => {
    const next = toStudioConfig(config);
    set({
      config: next,
      selectedTemplateId: next.activeTemplateId,
    });
  },
}));

export function selectStudioConfig(state: StudioConfigStore): GameConfig {
  return state.config;
}
