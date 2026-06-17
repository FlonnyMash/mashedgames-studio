import {
  BASELINE_TEMPLATE_ID,
  assertPermission,
  ClientProjectPayloadSchema,
  DEFAULT_GAME_CONFIG,
  exportClientPayload,
  enrichClientMeta,
  normalizeTemplateId,
  isLegacyTemplateId,
  patchFlatConfig,
  type ClientProjectPayload,
  type FlatFieldDefinition,
  type GameConfig,
  type GameProjectManifest,
} from "@mashedgames/shared";
import { create } from "state";

const CONFIGURATOR_MODE = "configurator" as const;

export type AssetSaveInput = {
  projectId: string;
  file: File;
  fieldKey: FlatFieldDefinition["key"];
};

export type AssetSaveResult = {
  relativePath: string;
  absolutePath: string;
  manifest?: GameProjectManifest;
};

export type AssetSaveHandler = (input: AssetSaveInput) => Promise<AssetSaveResult>;

export interface ConfiguratorStore {
  config: GameConfig;
  selectedTemplateId: string;
  projectId: string | null;
  projectManifest: GameProjectManifest | null;
  savedClient: ClientProjectPayload | null;
  projectMode: boolean;
  assetSaveHandler: AssetSaveHandler | null;
  setSelectedTemplateId: (id: string) => void;
  patchConfig: <K extends keyof GameConfig>(
    key: K,
    value: GameConfig[K],
  ) => void;
  exportClientPayload: () => ClientProjectPayload;
  resetBranding: () => void;
  hydrateProject: (input: {
    manifest: GameProjectManifest;
    config: GameConfig;
    client: ClientProjectPayload;
  }) => void;
  clearProject: () => void;
  markClientSaved: () => void;
  updateProjectManifest: (manifest: GameProjectManifest) => void;
  hasUnsavedClient: () => boolean;
  setAssetSaveHandler: (handler: AssetSaveHandler | null) => void;
  setConfig: (config: GameConfig) => void;
  uploadBrandingAsset: (
    file: File,
    fieldKey: FlatFieldDefinition["key"],
  ) => Promise<void>;
}

function brandingDefaults(): GameConfig {
  assertPermission(CONFIGURATOR_MODE, "schema:branding");
  const fallbackTemplateId = normalizeTemplateId(DEFAULT_GAME_CONFIG.activeTemplateId);
  return {
    ...DEFAULT_GAME_CONFIG,
    activeTemplateId: fallbackTemplateId,
    appMode: CONFIGURATOR_MODE,
  };
}

export const useConfiguratorStore = create<ConfiguratorStore>((set, get) => ({
  config: brandingDefaults(),
  selectedTemplateId: normalizeTemplateId(DEFAULT_GAME_CONFIG.activeTemplateId),
  projectId: null,
  projectManifest: null,
  savedClient: null,
  projectMode: false,
  assetSaveHandler: null,

  setSelectedTemplateId: (id) => {
    if (get().projectMode) return;
    const normalizedId = normalizeTemplateId(id);
    if (isLegacyTemplateId(id)) {
      console.warn(
        `[useConfiguratorStore] Migrating legacy template "${id}" -> "${BASELINE_TEMPLATE_ID}"`,
      );
    }
    set({
      selectedTemplateId: normalizedId,
      config: { ...get().config, activeTemplateId: normalizedId },
    });
  },

  patchConfig: (key, value) => {
    assertPermission(CONFIGURATOR_MODE, "schema:branding");
    set({ config: patchFlatConfig(get().config, key, value) });
  },

  exportClientPayload: () => exportClientPayload(get().config),

  resetBranding: () => {
    const { projectManifest } = get();
    if (projectManifest) {
      set({
        config: enrichClientMeta(brandingDefaults(), {
          projectId: projectManifest.projectId,
          parentTemplateId: projectManifest.parentTemplateId,
        }),
      });
      return;
    }
    set({ config: brandingDefaults() });
  },

  hydrateProject: ({ manifest, config, client }) => {
    const resolvedTemplateId = normalizeTemplateId(
      manifest.parentTemplateId || config.activeTemplateId,
    );
    if (
      isLegacyTemplateId(manifest.parentTemplateId) ||
      isLegacyTemplateId(config.activeTemplateId)
    ) {
      console.warn(
        `[useConfiguratorStore] Migrating legacy project template to "${BASELINE_TEMPLATE_ID}"`,
      );
    }
    set({
      projectMode: true,
      projectId: manifest.projectId,
      projectManifest: {
        ...manifest,
        parentTemplateId: resolvedTemplateId,
      },
      selectedTemplateId: resolvedTemplateId,
      config: {
        ...config,
        ...client,
        activeTemplateId: resolvedTemplateId,
        projectId: manifest.projectId,
      },
      savedClient: ClientProjectPayloadSchema.parse(client),
    });
  },

  clearProject: () => {
    set({
      projectMode: false,
      projectId: null,
      projectManifest: null,
      savedClient: null,
      config: brandingDefaults(),
      selectedTemplateId: normalizeTemplateId(DEFAULT_GAME_CONFIG.activeTemplateId),
    });
  },

  markClientSaved: () => {
    set({ savedClient: get().exportClientPayload() });
  },

  updateProjectManifest: (manifest) => {
    set({ projectManifest: manifest });
  },

  hasUnsavedClient: () => {
    const saved = get().savedClient;
    if (!saved) return true;
    const current = JSON.stringify(get().exportClientPayload());
    return current !== JSON.stringify(saved);
  },

  setAssetSaveHandler: (handler) => {
    set({ assetSaveHandler: handler });
  },

  setConfig: (config) => {
    const resolvedTemplateId = normalizeTemplateId(config.activeTemplateId);
    if (isLegacyTemplateId(config.activeTemplateId)) {
      console.warn(
        `[useConfiguratorStore] Migrating legacy config template "${config.activeTemplateId}" -> "${BASELINE_TEMPLATE_ID}"`,
      );
    }
    set({
      config: {
        ...config,
        activeTemplateId: resolvedTemplateId,
        appMode: CONFIGURATOR_MODE,
      },
      selectedTemplateId: resolvedTemplateId,
    });
  },

  uploadBrandingAsset: async (file, fieldKey) => {
    const handler = get().assetSaveHandler;
    const projectId = get().projectId;
    if (!handler || !projectId) {
      throw new Error("Asset upload is unavailable outside a loaded project.");
    }
    const result = await handler({ projectId, file, fieldKey });
    get().patchConfig(fieldKey as keyof GameConfig, result.relativePath as never);
    if (result.manifest) {
      get().updateProjectManifest(result.manifest);
    }
  },
}));

export function selectConfiguratorConfig(state: ConfiguratorStore): GameConfig {
  return state.config;
}
