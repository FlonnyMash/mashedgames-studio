import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDeployEnv,
  resolveTemplateDir,
  resolveTemplateLibraryRoot,
} from "./template-library-root.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardRoot = path.join(repoRoot, "apps", "dashboard");
const bakedConfigPath = path.join(
  dashboardRoot,
  "src",
  "demo-player",
  "demo-config.baked.json",
);

const UNIVERSAL_TEXTURE_FIELD_KEYS = ["logoUrl"];

const TEMPLATE_TEXTURE_FIELD_KEYS = [
  "playerCatcherUrl",
  "collectibleGoodUrl",
  "collectibleBadUrl",
];

/** Top-level GameConfig keys — anything else is template-specific and belongs in `fields`. */
const GAME_CONFIG_TOP_LEVEL_KEYS = new Set([
  "activeTemplateId",
  "projectId",
  "schemaVersion",
  "appMode",
  "themeColor",
  "backgroundColor",
  "logoUrl",
  "clientName",
  "clientLogoPath",
  "startScreenTitle",
  "startScreenSubtitle",
  "ctaLabel",
  "playerSpeed",
  "gameDurationSeconds",
  "parentTemplateId",
  "parentPinnedVersion",
  "lastParentSyncAt",
  "startScreenTitleColor",
  "startScreenTitleBold",
  "startScreenTitleItalic",
  "startScreenTitleUnderline",
  "startScreenSubtitleColor",
  "startScreenSubtitleBold",
  "startScreenSubtitleItalic",
  "startScreenSubtitleUnderline",
  "ctaTextColor",
  "ctaLabelBold",
  "ctaLabelItalic",
  "ctaLabelUnderline",
  "leadCaptureTitle",
  "leadCaptureSubtitle",
  "leadCaptureNamePlaceholder",
  "leadCaptureEmailPlaceholder",
  "leadCaptureSubmitLabel",
  "leadCaptureRetryLabel",
  "leadCaptureTitleColor",
  "leadCaptureTitleBold",
  "leadCaptureTitleItalic",
  "leadCaptureTitleUnderline",
  "leadCaptureSubtitleColor",
  "leadCaptureSubtitleBold",
  "leadCaptureSubtitleItalic",
  "leadCaptureSubtitleUnderline",
  "leadCaptureSubmitColor",
  "leadCaptureSubmitBold",
  "leadCaptureSubmitItalic",
  "leadCaptureSubmitUnderline",
  "leadCaptureRetryColor",
  "leadCaptureRetryBold",
  "leadCaptureRetryItalic",
  "leadCaptureRetryUnderline",
  "highscoreTitle",
  "highscoreSubtitle",
  "highscoreTitleColor",
  "highscoreTitleBold",
  "highscoreTitleItalic",
  "highscoreTitleUnderline",
  "highscoreSubtitleColor",
  "highscoreSubtitleBold",
  "highscoreSubtitleItalic",
  "highscoreSubtitleUnderline",
  "showStartScreen",
  "showHighscore",
  "showLeadCapture",
  "showCountdownTimer",
  "fields",
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    shell: true,
    env: options.env ?? process.env,
  });

  if (result.error) {
    console.error(
      `[build-demo-bundle] Failed to spawn "${command}": ${result.error.message}`,
    );
    return { ok: false, status: 1 };
  }

  if (typeof result.status === "number" && result.status === 0) {
    return { ok: true };
  }

  console.error(
    `[build-demo-bundle] Command failed: ${command} ${args.join(" ")} ` +
      `(exit code ${result.status ?? "null"})`,
  );
  return { ok: false, status: result.status ?? 1 };
}

function copyDir(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

function readTextureFieldPath(config, fieldKey) {
  if (UNIVERSAL_TEXTURE_FIELD_KEYS.includes(fieldKey)) {
    return config[fieldKey];
  }

  const fields = config.fields;
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    const nested = fields[fieldKey];
    if (typeof nested === "string" && nested.trim()) {
      return nested;
    }
  }

  // Legacy templates may still store template textures at the top level.
  return config[fieldKey];
}

function buildRuntimeAssets(templateDir, config) {
  const runtimeAssets = {};
  const textureFieldKeys = [
    ...UNIVERSAL_TEXTURE_FIELD_KEYS,
    ...TEMPLATE_TEXTURE_FIELD_KEYS,
  ];

  for (const fieldKey of textureFieldKeys) {
    const assetPath = readTextureFieldPath(config, fieldKey);
    if (typeof assetPath !== "string" || !assetPath.trim()) {
      continue;
    }

    const relativePath = assetPath.replace(/^\//, "");
    const absolutePath = path.join(templateDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const fileName = relativePath.replace(/^assets\//, "");
    // Absolute site-root paths — the engine iframe lives at /engine/index.html so
    // relative ./game-assets/ would incorrectly resolve to /engine/game-assets/.
    runtimeAssets[relativePath] = `/game-assets/${fileName}`;
  }

  return runtimeAssets;
}

/**
 * Hoists legacy top-level template-specific keys into GameConfig.fields so
 * runtime scenes (which read config.fields) and demo rebuilds stay aligned.
 */
function normalizeConfigFields(raw) {
  const config = { ...raw };
  const fields =
    typeof config.fields === "object" &&
    config.fields !== null &&
    !Array.isArray(config.fields)
      ? { ...config.fields }
      : {};

  for (const [key, value] of Object.entries(config)) {
    if (key === "fields" || GAME_CONFIG_TOP_LEVEL_KEYS.has(key)) {
      continue;
    }
    if (!(key in fields)) {
      fields[key] = value;
    }
    delete config[key];
  }

  config.fields = fields;
  return config;
}

function normalizeDemoConfig(raw, templateSlug) {
  const hoisted = normalizeConfigFields(raw);
  return {
    ...hoisted,
    activeTemplateId: templateSlug,
    appMode: "studio",
  };
}

function writeBakedDemoConfig(demoConfig) {
  fs.mkdirSync(path.dirname(bakedConfigPath), { recursive: true });
  fs.writeFileSync(
    bakedConfigPath,
    `${JSON.stringify(demoConfig, null, 2)}\n`,
    "utf8",
  );
}

function writeCloudflareHeaders(outDir) {
  fs.writeFileSync(
    path.join(outDir, "_headers"),
    ["/demo-config.json", "  Cache-Control: no-store, no-cache, must-revalidate", ""].join(
      "\n",
    ),
    "utf8",
  );
}

export function buildDemoBundle(templateSlug, outDir) {
  const deployEnv = loadDeployEnv(repoRoot);
  const templateLibraryRoot = resolveTemplateLibraryRoot(repoRoot, deployEnv);
  const templateDir = resolveTemplateDir(repoRoot, templateSlug, deployEnv);
  const templateConfigJson = path.join(templateDir, "config.json");
  const templateAssetsDir = path.join(templateDir, "assets");

  if (!fs.existsSync(templateDir) || !fs.statSync(templateDir).isDirectory()) {
    throw new Error(
      `Template folder not found: ${templateDir}\n` +
        `Make sure "${templateSlug}" exists in the studio template library or packages/templates/src/.`,
    );
  }

  console.log(`[build-demo-bundle] Template library root: ${templateLibraryRoot}`);
  console.log(`[build-demo-bundle] Using template source: ${templateDir}`);

  if (!fs.existsSync(templateConfigJson)) {
    throw new Error(`config.json not found in template folder: ${templateConfigJson}`);
  }

  const rawConfig = JSON.parse(fs.readFileSync(templateConfigJson, "utf8"));
  const config = normalizeDemoConfig(rawConfig, templateSlug);
  const runtimeAssets = buildRuntimeAssets(templateDir, config);
  const demoConfig = {
    templateId: templateSlug,
    config,
    runtimeAssets,
  };

  console.log(
    `[build-demo-bundle] Baking config (backgroundColor=${config.backgroundColor ?? "n/a"})`,
  );
  writeBakedDemoConfig(demoConfig);

  const resolvedOutDir = path.resolve(outDir);
  fs.mkdirSync(path.dirname(resolvedOutDir), { recursive: true });
  fs.rmSync(resolvedOutDir, { recursive: true, force: true });
  fs.mkdirSync(resolvedOutDir, { recursive: true });

  console.log(`[build-demo-bundle] Building engine for template: ${templateSlug}`);
  const engineResult = run("pnpm", ["build:engine"], { env: deployEnv });
  if (!engineResult.ok) {
    throw new Error("Engine build failed.");
  }

  const demoConfigJson = `${JSON.stringify(demoConfig, null, 2)}\n`;
  fs.writeFileSync(
    path.join(dashboardRoot, "demo-player", "demo-config.json"),
    demoConfigJson,
    "utf8",
  );

  console.log(`[build-demo-bundle] Building demo shell into ${resolvedOutDir}`);
  const shellResult = run(
    "pnpm",
    ["--config.verifyDepsBeforeRun=false", "--filter", "dashboard", "build:demo-shell"],
    {
      env: {
        ...deployEnv,
        DEMO_BUNDLE_OUT_DIR: resolvedOutDir,
      },
    },
  );
  if (!shellResult.ok) {
    throw new Error("Demo shell build failed.");
  }

  const engineSrc = path.join(dashboardRoot, "public", "engine");
  if (!fs.existsSync(engineSrc)) {
    throw new Error(`Missing engine output: ${engineSrc}`);
  }

  console.log(`[build-demo-bundle] Staging engine/`);
  copyDir(engineSrc, path.join(resolvedOutDir, "engine"));

  if (fs.existsSync(templateAssetsDir) && fs.statSync(templateAssetsDir).isDirectory()) {
    console.log(`[build-demo-bundle] Staging game-assets/`);
    copyDir(templateAssetsDir, path.join(resolvedOutDir, "game-assets"));
  } else {
    console.log(`[build-demo-bundle] No template assets/ folder — skipping game-assets copy.`);
  }

  fs.writeFileSync(path.join(resolvedOutDir, "demo-config.json"), demoConfigJson, "utf8");
  writeCloudflareHeaders(resolvedOutDir);

  console.log(`[build-demo-bundle] Wrote demo-config.json`);
  console.log(`[build-demo-bundle] Bundle ready: ${resolvedOutDir}`);

  return resolvedOutDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const templateSlug = process.argv[2];
  const outDir = process.argv[3];

  if (!templateSlug || !outDir) {
    console.error(
      "[build-demo-bundle] ERROR: Missing arguments.\n" +
        "Usage: node scripts/build-demo-bundle.mjs <template-slug> <out-dir>\n" +
        "Example: node scripts/build-demo-bundle.mjs catch-game .demo-dist/catch-game",
    );
    process.exit(1);
  }

  try {
    buildDemoBundle(templateSlug, outDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[build-demo-bundle] ERROR: ${message}`);
    process.exit(1);
  }
}
