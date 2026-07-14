import { DEFAULT_GAME_CONFIG } from "@mashedgames/shared";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureWorkspaceExists, templateLibraryRoot } from "@/lib/project-paths";
import { monorepoRoot } from "@/lib/template-library-root";
import { TEMPLATE_ID_PATTERN } from "@/lib/template-import-normalize";

export async function createTemplateFromGenerator(input: {
  templateId: string;
  displayName: string;
}): Promise<
  | { ok: true; templateId: string; repositoryPath: string }
  | { ok: false; error: string; status: number }
> {
  return createGameTemplate({
    name: input.displayName,
    templateId: input.templateId,
  });
}

/** Convert a kebab-case template id to PascalCase class name, e.g. "my-game" → "MyGame" */
function toPascalCase(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Resolve and validate the target directory inside packages/templates/src/.
 * Throws if the resolved path escapes the expected root (traversal guard).
 */
function resolvePackageTemplateDir(templateId: string): string {
  const packagesTemplatesSrc = path.resolve(
    monorepoRoot,
    "packages/templates/src",
  );
  const resolved = path.resolve(packagesTemplatesSrc, templateId);

  if (
    !resolved.startsWith(packagesTemplatesSrc + path.sep) &&
    resolved !== packagesTemplatesSrc
  ) {
    throw new Error("Invalid template path — possible path traversal.");
  }

  return resolved;
}

function buildManifestSource(templateId: string, displayName: string): string {
  return `import { type TemplateSchema } from "@mashedgames/shared";

export const ${toPascalCase(templateId).charAt(0).toLowerCase() + toPascalCase(templateId).slice(1)}Manifest = {
  templateId: "${templateId}",
  version: "1.0.0",
  displayName: "${displayName}",
  lockedFields: ["activeTemplateId", "schemaVersion"],
  supportsUI: [],
  supportedEvents: [],
  assetRestrictions: [],
  fields: [],
} satisfies TemplateSchema;

export type ${toPascalCase(templateId)}Manifest = typeof ${toPascalCase(templateId).charAt(0).toLowerCase() + toPascalCase(templateId).slice(1)}Manifest;
`;
}

function buildSceneSource(templateId: string, displayName: string): string {
  const className = `${toPascalCase(templateId)}Scene`;
  const sceneKey = templateId.toUpperCase().replace(/-/g, "_") + "_SCENE";

  return `import Phaser from "phaser";

export const ${sceneKey}_KEY = "${templateId}-scene";

export interface ${className}InitData {
  // Add init data fields here
}

export class ${className} extends Phaser.Scene {
  constructor() {
    super({ key: ${sceneKey}_KEY });
  }

  preload(): void {
    // Load assets for ${displayName} here
  }

  create(_data?: ${className}InitData): void {
    this.cameras.main.setBackgroundColor("#0f172a");
  }

  update(_time: number, _delta: number): void {
    // Game loop logic for ${displayName}
  }
}
`;
}

/**
 * Mirrors buildAgentsFile in packages/templates/scripts/create-template.mjs.
 * Duplicated here (rather than imported cross-package) because this runs
 * inside the Next.js/Electron production process, where the CLI's dev-only
 * script is not guaranteed to be present in the packaged bundle. Keep both
 * in sync when the sandbox rules content changes.
 */
function buildAgentsSource(templateId: string): string {
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

function buildIndexExportLines(
  templateId: string,
): { manifestLine: string; sceneLine: string } {
  const pascal = toPascalCase(templateId);
  const camel =
    pascal.charAt(0).toLowerCase() + pascal.slice(1);
  const sceneKey = templateId.toUpperCase().replace(/-/g, "_") + "_SCENE";
  const className = `${pascal}Scene`;

  return {
    manifestLine: `export { ${camel}Manifest, type ${pascal}Manifest } from "./${templateId}/manifest";`,
    sceneLine: `export { ${className}, ${sceneKey}_KEY, type ${className}InitData } from "./${templateId}/${className}";`,
  };
}

function scaffoldTemplatePackage(
  templateId: string,
  displayName: string,
): void {
  const templateDir = resolvePackageTemplateDir(templateId);
  mkdirSync(templateDir, { recursive: true });

  const pascal = toPascalCase(templateId);
  const sceneFileName = `${pascal}Scene.ts`;

  writeFileSync(
    path.join(templateDir, "manifest.ts"),
    buildManifestSource(templateId, displayName),
    "utf8",
  );

  writeFileSync(
    path.join(templateDir, sceneFileName),
    buildSceneSource(templateId, displayName),
    "utf8",
  );

  writeFileSync(
    path.join(templateDir, "AGENTS.md"),
    buildAgentsSource(templateId),
    "utf8",
  );

  const indexPath = path.resolve(
    monorepoRoot,
    "packages/templates/src/index.ts",
  );

  const existing = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : "";

  const { manifestLine, sceneLine } = buildIndexExportLines(templateId);

  const linesToAppend: string[] = [];
  if (!existing.includes(manifestLine)) linesToAppend.push(manifestLine);
  if (!existing.includes(sceneLine)) linesToAppend.push(sceneLine);

  if (linesToAppend.length > 0) {
    const separator = existing.endsWith("\n") ? "" : "\n";
    writeFileSync(
      indexPath,
      existing + separator + linesToAppend.join("\n") + "\n",
      "utf8",
    );
  }
}

export function createGameTemplate(input: {
  name: string;
  templateId: string;
}):
  | { ok: true; templateId: string; repositoryPath: string }
  | { ok: false; error: string; status: number } {
  const templateId = input.templateId.trim();
  const name = input.name.trim();

  if (!name) {
    return { ok: false, error: "Template name is required.", status: 400 };
  }
  if (!TEMPLATE_ID_PATTERN.test(templateId)) {
    return { ok: false, error: "Invalid template id.", status: 400 };
  }

  try {
    ensureWorkspaceExists();

    const templateDir = path.join(templateLibraryRoot, templateId);
    mkdirSync(templateDir, { recursive: true });
    writeFileSync(
      path.join(templateDir, "config.json"),
      `${JSON.stringify({ ...DEFAULT_GAME_CONFIG, activeTemplateId: templateId }, null, 2)}\n`,
      "utf8",
    );

    scaffoldTemplatePackage(templateId, name);

    return { ok: true, templateId, repositoryPath: templateDir };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Create failed.",
      status: 500,
    };
  }
}
