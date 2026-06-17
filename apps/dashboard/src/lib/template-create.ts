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
  meta: {},
  configFieldHints: {},
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
