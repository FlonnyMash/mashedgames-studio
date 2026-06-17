import { GameConfigSchema, type GameConfig } from "@mashedgames/shared";

export class FlatConfigIpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlatConfigIpcError";
  }
}

function requireElectron() {
  const electron = window.electron?.ipcRenderer;
  if (!electron) {
    throw new FlatConfigIpcError(
      "Flat config save/load is only available in the Mashed Games Studio desktop app.",
    );
  }
  return electron;
}

/**
 * Serializes and saves the current flat GameConfig to
 * {workspace}/Projects/{projectId}/config.json via Electron IPC.
 *
 * Validates through GameConfigSchema before sending so corrupted store state
 * is caught before it reaches the file system.
 */
export async function saveFlatConfigViaElectron(
  projectId: string,
  config: GameConfig,
): Promise<void> {
  const validatedConfig = GameConfigSchema.parse(config);

  const electron = requireElectron();
  const result = await electron.invoke("save-flat-config", {
    projectId,
    config: validatedConfig,
  });

  if (!result.ok) {
    throw new FlatConfigIpcError(
      `Save failed: ${"error" in result ? result.error : "unknown error"}`,
    );
  }
}

/**
 * Loads config.json from {workspace}/Projects/{projectId}/ via Electron IPC
 * and runs the raw JSON through GameConfigSchema.parse() before returning.
 *
 * This acts as a strict security gatekeeper: if the file on disk contains
 * missing fields, wrong types, or extra keys that fail Zod coercion, a
 * ZodError is thrown and the Zustand store is never touched.
 */
export async function loadFlatConfigViaElectron(
  projectId: string,
): Promise<GameConfig> {
  const electron = requireElectron();
  const result = await electron.invoke("load-flat-config", { projectId });

  if (!result.ok) {
    throw new FlatConfigIpcError(
      `Load failed: ${"error" in result ? result.error : "unknown error"}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.raw);
  } catch {
    throw new FlatConfigIpcError(
      "Saved config.json contains invalid JSON and cannot be loaded.",
    );
  }

  return GameConfigSchema.parse(parsed);
}

export async function getProjectListViaElectron(
  mode: "studio" | "configurator",
  filters?: { templateId?: string; projectId?: string },
): Promise<string[]> {
  const electron = requireElectron();
  return electron.invoke("get-project-list", {
    mode,
    templateId: filters?.templateId,
    projectId: filters?.projectId,
  });
}
