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
export const SRC_ROOT = path.join(PACKAGE_ROOT, "src");

export const TEMPLATE_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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

export function buildAgentsFile(templateId) {
  return `# Template Sandbox — AI Isolation Rules

You are an AI assistant operating inside the **Mashed Games Studio** template sandbox.
Your jurisdiction is **strictly limited** to the template you are currently working on.

---

## Sandbox Boundary

You MAY only create or modify files inside:

\`\`\`
packages/templates/src/${templateId}/
\`\`\`

Where \`${templateId}\` is the specific template directory you have been assigned (e.g. \`catch-game\`, \`quiz-game\`).

You MUST NOT create files at any other path. If you need a shared utility, raise it for the Lead Architect to add to \`@mashedgames/shared\`.

---

## Read-Only Zones — NEVER MODIFY

The following are external API dependencies. Treat every file in them as read-only:

| Path | Why it is read-only |
|---|---|
| \`apps/game-engine/**\` | Phaser runtime — versioned and built separately |
| \`packages/shared/**\` | Contract layer — owned by the Lead Architect |
| \`apps/dashboard/**\` | Next.js UI — separate release cycle |
| \`apps/desktop/**\` | Electron main process — security boundary |
| \`packages/configurator-engine/**\` | Studio UI package — separate release cycle |
| \`packages/studio-engine/**\` | Studio UI package — separate release cycle |
| \`packages/state/**\` | State factory — separate release cycle |

If any task requires changing those files, **stop and raise it**. Do not silently edit them.

---

## Import Rules

- Import ONLY via workspace package names: \`@mashedgames/shared\`, \`@mashedgames/game-engine\`.
- NEVER use relative \`../\` paths that escape \`packages/templates/src/${templateId}/\`.
- NEVER import from \`apps/dashboard/src/\`, \`apps/game-engine/src/\`, or any \`packages/*/src/\` directly.

---

## Template Manifest Contract

Every template directory MUST have a \`manifest.ts\` that exports a \`satisfies TemplateSchema\` object.

The manifest MUST explicitly declare all four required fields — no silent omissions:

\`\`\`typescript
import { type TemplateSchema, type TemplateFieldDescriptor } from '@mashedgames/shared';

const myGameFields: TemplateFieldDescriptor[] = [
  // { key, type, label, group?, min?, max?, step?, default, textureKey? }
];

export const myGameManifest = {
  templateId:       '${templateId}',    // must match directory name
  version:          '1.0.0',
  displayName:      '<Human readable>',
  lockedFields:     [...],              // GameConfig keys configurator cannot change
  supportsUI:       [...],              // UIModule values from @mashedgames/shared
  supportedEvents:  [...],             // GameLifecycleEventType values from @mashedgames/shared
  assetRestrictions: [...],            // at least one entry if sprites are replaceable
  fields:           myGameFields,      // TemplateFieldDescriptor[] — the ONLY source of
                                        // per-template config keys, defaults, and UI metadata
} satisfies TemplateSchema;
\`\`\`

---

## Phaser / UI Separation Law

**Phaser NEVER renders UI.** This is an absolute rule.

Phaser \`MainScene\` is permitted to:
- Run gameplay logic (collision, scoring, timers)
- Emit Phaser scene events: \`this.events.emit('score-update', { score })\`

Phaser \`MainScene\` is PROHIBITED from:
- Rendering score text, titles, forms, or buttons via Phaser Text/DOM objects
- Calling \`document.querySelector\` or manipulating \`#ui-layer\` directly
- Importing React or any dashboard component

All user-facing UI (scores, start screens, lead capture, highscore boards) lives in \`#ui-layer\` HTML overlays driven by \`GAME_LIFECYCLE_EVENT\` messages.

---

## Config Schema Law

- \`GameConfig\` is flat: top-level primitive keys only, plus one generic bucket — \`fields: Record<string, string | number | boolean>\`.
- Do NOT add nested objects, arrays, or \`.passthrough()\` to \`GameConfig\`.
- NEVER add a new hardcoded top-level key to \`GameConfig\` for template-specific tuning or assets.
  Declare it as a \`TemplateFieldDescriptor\` in your manifest's \`fields\` array instead — this is the
  single source of truth for the field's Zod validation, default value, and dynamic Configurator/Studio UI.
- At runtime your scene reads these values from \`config.fields.<key>\`, never from a top-level \`config.<key>\`.
- \`type: "image"\` fields MUST declare a \`textureKey\` matching an entry in \`assetRestrictions\`.
- If you need a new universal (template-agnostic) \`GameConfig\` field — e.g. something every template's
  DOM overlay would use — raise it for the Lead Architect instead of adding it yourself.

---

## Lifecycle Events

Templates declare which events they emit in \`supportedEvents\`. The overlay shell in
\`apps/game-engine/src/overlays/overlay-shell.ts\` bridges Phaser events to \`GAME_LIFECYCLE_EVENT\`
bridge messages. You do not write that bridge code — only declare the contract in your manifest.

Available event types (from \`@mashedgames/shared\`):

\`\`\`
ON_GAME_START | ON_GAME_READY | ON_SCORE_UPDATE | ON_GAME_OVER
ON_LEVEL_COMPLETE | ON_LIFE_LOST | ON_COMBO_UPDATE | ON_TIMER_UPDATE
\`\`\`

---

## Checklist Before Every Response

1. Are all file writes inside \`packages/templates/src/${templateId}/\`? If not, STOP.
2. Does the manifest \`satisfies TemplateSchema\` with all four required fields?
3. Does Phaser render any UI text or DOM elements? If yes, STOP and refactor.
4. Are there any \`../\` relative imports escaping the template directory? If yes, STOP.
5. Is \`GameConfig\` still flat after your changes? If not, STOP.
6. Did you add a new hardcoded key to \`GameConfig\` instead of a \`TemplateFieldDescriptor\` in \`fields\`? If yes, STOP and refactor.
`;
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
      name: "AGENTS.md",
      contents: buildAgentsFile(templateId),
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

const isDirectCliInvocation =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectCliInvocation) {
  main();
}
