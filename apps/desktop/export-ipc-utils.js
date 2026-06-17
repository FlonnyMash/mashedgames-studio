const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const archiver = require("archiver");
const {
  PROJECTS_DIR_NAME,
  PROJECT_ID_PATTERN,
} = require("./constants");

const ASSETS_DIR_NAME = "assets";

/**
 * Subdirectory name used to store promotional/editorial meta assets
 * (thumbnails, previews, tutorials). These are never part of a game bundle
 * and must be excluded from all exported zips.
 */
const META_SUBDIR_NAME = "meta";

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

function resolveBundledEngineDir(app) {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "standalone",
      "apps",
      "dashboard",
      "public",
      "engine",
    );
  }

  return path.resolve(__dirname, "../dashboard/public/engine");
}

function resolveProjectDir(workspacePath, projectId) {
  if (!projectId || !PROJECT_ID_PATTERN.test(projectId)) {
    return null;
  }

  const projectDir = path.normalize(
    path.join(workspacePath, PROJECTS_DIR_NAME, projectId),
  );

  if (!isPathInsideWorkspace(projectDir, workspacePath)) {
    return null;
  }

  return projectDir;
}

function resolveProjectAssetsDir(workspacePath, projectId) {
  const projectDir = resolveProjectDir(workspacePath, projectId);
  if (!projectDir) {
    return null;
  }

  const assetsDir = path.normalize(path.join(projectDir, ASSETS_DIR_NAME));
  if (!isPathInsideWorkspace(assetsDir, workspacePath)) {
    return null;
  }

  return assetsDir;
}

async function listFilesRecursive(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolute)));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

async function exportProjectToZip({
  workspacePath,
  engineDir,
  destZipPath,
  configJson,
  projectId,
}) {
  if (!engineDir || !path.isAbsolute(path.resolve(engineDir))) {
    throw new Error("Invalid engine directory.");
  }

  if (!(await fsp.stat(engineDir)).isDirectory()) {
    throw new Error(`Engine directory not found: ${engineDir}`);
  }

  const normalizedDest = path.normalize(destZipPath);
  await fsp.mkdir(path.dirname(normalizedDest), { recursive: true });

  const output = fs.createWriteStream(normalizedDest);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const archiveDone = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);
  archive.directory(engineDir, false);
  archive.append(configJson, { name: "config.json" });

  const assetsDir = resolveProjectAssetsDir(workspacePath, projectId);
  if (assetsDir && fs.existsSync(assetsDir)) {
    const stat = await fsp.stat(assetsDir);
    if (stat.isDirectory()) {
      const assetFiles = await listFilesRecursive(assetsDir);
      for (const absolute of assetFiles) {
        const relative = path
          .relative(assetsDir, absolute)
          .replace(/\\/g, "/");
        if (!relative || relative.includes("..")) {
          continue;
        }
        // Exclude any file inside a meta/ subdirectory — these are
        // promotional assets (thumbnails, previews) and must never ship
        // inside a game bundle.
        const pathParts = relative.split("/");
        if (pathParts.includes(META_SUBDIR_NAME)) {
          continue;
        }
        archive.file(absolute, { name: `${ASSETS_DIR_NAME}/${relative}` });
      }
    }
  }

  await archive.finalize();
  await archiveDone;

  return { savePath: normalizedDest };
}

module.exports = {
  ASSETS_DIR_NAME,
  META_SUBDIR_NAME,
  exportProjectToZip,
  isPathInsideWorkspace,
  resolveBundledEngineDir,
  resolveProjectAssetsDir,
  resolveProjectDir,
};
