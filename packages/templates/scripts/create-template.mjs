#!/usr/bin/env node
// Scaffolding CLI for new zero-state templates.
// Usage: node scripts/create-template.mjs <template-id>
//   e.g. node scripts/create-template.mjs my-new-game

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(PACKAGE_ROOT, "src");
const MASTER_CURSORRULES_PATH = path.join(PACKAGE_ROOT, ".cursorrules");

const TEMPLATE_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function fail(message) {
  console.error(`\n[create-template] Error: ${message}\n`);
  process.exit(1);
}

function toPascalCase(templateId) {
  return templateId
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

function toCamelCase(templateId) {
  const pascal = toPascalCase(templateId);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toDisplayName(templateId) {
  return templateId
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toConstantCase(templateId) {
  return templateId.toUpperCase().replace(/-/g, "_");
}

function buildManifestFile(templateId, pascalName, camelName) {
  return `import { type TemplateSchema } from "@mashedgames/shared";

export const ${camelName}Manifest = {
  templateId: "${templateId}",
  version: "1.0.0",
  displayName: "${toDisplayName(templateId)}",
  lockedFields: ["activeTemplateId", "schemaVersion"],
  supportsUI: [],
  supportedEvents: [],
  assetRestrictions: [],
  fields: [],
} satisfies TemplateSchema;

export type ${pascalName}Manifest = typeof ${camelName}Manifest;
`;
}

function buildSceneFile(templateId, pascalName, constantName) {
  return `import Phaser from "phaser";

export const ${constantName}_SCENE_KEY = "${templateId}-scene";

export interface ${pascalName}SceneInitData {
  // Add init data fields here
}

export class ${pascalName}Scene extends Phaser.Scene {
  constructor() {
    super({ key: ${constantName}_SCENE_KEY });
  }

  preload(): void {
    // Load assets for ${toDisplayName(templateId)} here
  }

  create(_data?: ${pascalName}SceneInitData): void {
    this.cameras.main.setBackgroundColor("#0f172a");
  }

  update(_time: number, _delta: number): void {
    // Game loop logic for ${toDisplayName(templateId)}
  }
}
`;
}

function buildConfigFile(templateId) {
  const config = {
    activeTemplateId: templateId,
    schemaVersion: "2.0.0",
    themeColor: "#6366f1",
    backgroundColor: "#0f172a",
    startScreenTitle: "Ready to play?",
    startScreenSubtitle: "Tap start when you are ready.",
    ctaLabel: "Start Game",
    playerSpeed: 320,
    gameDurationSeconds: 60,
    startScreenTitleColor: "#ffffff",
    startScreenTitleBold: false,
    startScreenTitleItalic: false,
    startScreenTitleUnderline: false,
    startScreenSubtitleColor: "#ffffff",
    startScreenSubtitleBold: false,
    startScreenSubtitleItalic: false,
    startScreenSubtitleUnderline: false,
    ctaTextColor: "#1e293b",
    ctaLabelBold: false,
    ctaLabelItalic: false,
    ctaLabelUnderline: false,
    leadCaptureTitle: "Great run!",
    leadCaptureSubtitle: "Enter your details to save your score.",
    leadCaptureNamePlaceholder: "Your name",
    leadCaptureEmailPlaceholder: "Email address",
    leadCaptureSubmitLabel: "Submit",
    leadCaptureRetryLabel: "Try again",
    leadCaptureTitleColor: "#ffffff",
    leadCaptureTitleBold: false,
    leadCaptureTitleItalic: false,
    leadCaptureTitleUnderline: false,
    leadCaptureSubtitleColor: "#a1a1aa",
    leadCaptureSubtitleBold: false,
    leadCaptureSubtitleItalic: false,
    leadCaptureSubtitleUnderline: false,
    leadCaptureSubmitColor: "#ffffff",
    leadCaptureSubmitBold: false,
    leadCaptureSubmitItalic: false,
    leadCaptureSubmitUnderline: false,
    leadCaptureRetryColor: "#1e293b",
    leadCaptureRetryBold: false,
    leadCaptureRetryItalic: false,
    leadCaptureRetryUnderline: false,
    highscoreTitle: "Leaderboard",
    highscoreSubtitle: "Top scores this week",
    highscoreTitleColor: "#ffffff",
    highscoreTitleBold: false,
    highscoreTitleItalic: false,
    highscoreTitleUnderline: false,
    highscoreSubtitleColor: "#a1a1aa",
    highscoreSubtitleBold: false,
    highscoreSubtitleItalic: false,
    highscoreSubtitleUnderline: false,
    showStartScreen: false,
    showHighscore: false,
    showLeadCapture: false,
    showCountdownTimer: false,
    fields: {},
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

function buildCursorRules(templateId) {
  if (!fs.existsSync(MASTER_CURSORRULES_PATH)) {
    fail(
      `Master rules file not found at ${MASTER_CURSORRULES_PATH}. Cannot generate sandboxed .cursorrules.`
    );
  }
  const masterRules = fs.readFileSync(MASTER_CURSORRULES_PATH, "utf8");
  return masterRules.split("<template-id>").join(templateId);
}

function main() {
  const templateId = process.argv[2];

  if (!templateId) {
    fail(
      "Missing template id.\nUsage: node scripts/create-template.mjs <template-id>\nExample: node scripts/create-template.mjs my-new-game"
    );
  }

  if (!TEMPLATE_ID_PATTERN.test(templateId)) {
    fail(
      `Invalid template id "${templateId}". Must be lowercase alphanumeric with single dashes as separators (e.g. "my-new-game"), starting with a letter, no leading/trailing/consecutive dashes.`
    );
  }

  const targetDir = path.join(SRC_ROOT, templateId);

  if (fs.existsSync(targetDir)) {
    fail(`Template directory already exists: ${targetDir}`);
  }

  const pascalName = toPascalCase(templateId);
  const camelName = toCamelCase(templateId);
  const constantName = toConstantCase(templateId);

  fs.mkdirSync(targetDir, { recursive: true });

  const files = [
    {
      name: "manifest.ts",
      contents: buildManifestFile(templateId, pascalName, camelName),
    },
    {
      name: `${pascalName}Scene.ts`,
      contents: buildSceneFile(templateId, pascalName, constantName),
    },
    {
      name: "config.json",
      contents: buildConfigFile(templateId),
    },
    {
      name: ".cursorrules",
      contents: buildCursorRules(templateId),
    },
  ];

  for (const file of files) {
    fs.writeFileSync(path.join(targetDir, file.name), file.contents, "utf8");
  }

  console.log(`\n[create-template] Created template "${templateId}" at ${targetDir}\n`);
  console.log("Files generated:");
  for (const file of files) {
    console.log(`  - ${path.join("packages/templates/src", templateId, file.name)}`);
  }
  console.log(
    `\nNext manual step: register the new template's exports in packages/templates/src/index.ts:\n` +
      `  export { ${camelName}Manifest, type ${pascalName}Manifest } from "./${templateId}/manifest";\n` +
      `  export { ${pascalName}Scene, ${constantName}_SCENE_KEY, type ${pascalName}SceneInitData } from "./${templateId}/${pascalName}Scene";\n`
  );
}

main();
