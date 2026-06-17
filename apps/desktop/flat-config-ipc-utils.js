const fs = require("node:fs");
const path = require("node:path");
const { PROJECTS_DIR_NAME, PROJECT_ID_PATTERN } = require("./constants");

const CONFIG_FILE_NAME = "config.json";
const MAX_CONFIG_BYTES = 64 * 1024; // 64 KB — far exceeds any valid GameConfig

function isPathInsideWorkspace(filePath, workspacePath) {
  const resolvedFile = path.resolve(filePath);
  const resolvedWorkspace = path.resolve(workspacePath);
  const relative = path.relative(resolvedWorkspace, resolvedFile);
  if (!relative || relative === "") {
    return true;
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }
  return true;
}

function resolveProjectConfigPath(workspacePath, projectId) {
  if (!projectId || !PROJECT_ID_PATTERN.test(projectId)) {
    return null;
  }

  const resolved = path.normalize(
    path.join(workspacePath, PROJECTS_DIR_NAME, projectId, CONFIG_FILE_NAME),
  );

  if (!isPathInsideWorkspace(resolved, workspacePath)) {
    return null;
  }

  return resolved;
}

function saveFlatConfig(workspacePath, payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload.");
  }

  const { projectId, config } = payload;

  if (typeof projectId !== "string") {
    throw new Error("Invalid projectId.");
  }

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Invalid config: must be a plain object.");
  }

  const configPath = resolveProjectConfigPath(workspacePath, projectId);
  if (!configPath) {
    throw new Error("Invalid project ID or path traversal detected.");
  }

  let json;
  try {
    json = JSON.stringify(config, null, 2);
  } catch {
    throw new Error("Config could not be serialized to JSON.");
  }

  if (Buffer.byteLength(json, "utf8") > MAX_CONFIG_BYTES) {
    throw new Error("Config payload exceeds the 64 KB limit.");
  }

  const projectDir = path.dirname(configPath);
  try {
    fs.mkdirSync(projectDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to create project directory "${projectDir}": ${message}`,
    );
  }

  const tmpPath = configPath + ".tmp";
  try {
    // Remove any leftover .tmp file from a previous crashed write
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    fs.writeFileSync(tmpPath, json, "utf8");
    // fs.renameSync is atomic on NTFS (same volume) — the original config.json
    // is never touched if the process crashes between the two operations above.
    fs.renameSync(tmpPath, configPath);
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup failure; the stale .tmp will be removed on next save
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write config to "${configPath}": ${message}`);
  }

  return { ok: true };
}

function loadFlatConfig(workspacePath, payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload.");
  }

  const { projectId } = payload;

  if (typeof projectId !== "string") {
    throw new Error("Invalid projectId.");
  }

  const configPath = resolveProjectConfigPath(workspacePath, projectId);
  if (!configPath) {
    throw new Error("Invalid project ID or path traversal detected.");
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No saved config found for project "${projectId}". Save the project first.`,
    );
  }

  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read config from "${configPath}": ${message}`);
  }

  return { ok: true, raw };
}

/**
 * Returns the list of project folder names that have a saved config.json,
 * filtered to the caller's exact context.
 *
 * options.mode       — only include entries whose config.json has a matching
 *                      `appMode`. Files without `appMode` (legacy saves) are
 *                      excluded from any mode-scoped call.
 * options.templateId — further restrict Studio saves to those whose
 *                      config.json `activeTemplateId` matches the currently
 *                      open template, so templates never share each other's
 *                      save list.
 * options.projectId  — restrict Configurator saves to the single entry whose
 *                      folder name equals the currently open projectId.
 *
 * @param {string} workspacePath
 * @param {{ mode?: 'studio' | 'configurator', templateId?: string, projectId?: string }} [options]
 */
function getProjectList(workspacePath, options = {}) {
  const projectsDir = path.join(workspacePath, PROJECTS_DIR_NAME);
  if (!fs.existsSync(projectsDir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => {
      if (!e.isDirectory() || !PROJECT_ID_PATTERN.test(e.name)) return false;
      const configPath = path.join(projectsDir, e.name, CONFIG_FILE_NAME);
      if (!fs.existsSync(configPath)) return false;

      // Folder-name (projectId) filter — applied before reading the file.
      if (options.projectId !== undefined && e.name !== options.projectId) {
        return false;
      }

      // mode / templateId filters both require reading the config payload.
      if (options.mode !== undefined || options.templateId !== undefined) {
        let parsed;
        try {
          const raw = fs.readFileSync(configPath, "utf8");
          parsed = JSON.parse(raw);
        } catch {
          return false;
        }
        if (
          parsed === null ||
          typeof parsed !== "object" ||
          Array.isArray(parsed)
        ) {
          return false;
        }
        if (options.mode !== undefined && parsed.appMode !== options.mode) {
          return false;
        }
        if (
          options.templateId !== undefined &&
          parsed.activeTemplateId !== options.templateId
        ) {
          return false;
        }
      }

      return true;
    })
    .map((e) => e.name);
}

module.exports = {
  CONFIG_FILE_NAME,
  isPathInsideWorkspace,
  resolveProjectConfigPath,
  saveFlatConfig,
  loadFlatConfig,
  getProjectList,
};
