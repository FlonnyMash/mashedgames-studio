#!/usr/bin/env node
/**
 * Promotes a template to published by bumping its version in manifest.ts.
 * Reads the current version via regex, increments the patch segment, and
 * writes the updated version string back into the manifest.ts source.
 *
 * Usage: pnpm publish-template <template-id>
 * Example: pnpm publish-template catch-game
 */
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(scriptDir, "..");
const monorepoRoot = path.resolve(dashboardRoot, "../..");
const templatesRoot = path.resolve(monorepoRoot, "packages/templates/src");

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

function bumpPatchVersion(version: string): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "1.0.1";
  return `${parts[0]}.${parts[1]}.${(parts[2] ?? 0) + 1}`;
}

function extractVersion(source: string): string {
  const match = /version:\s*["']([^"']+)["']/.exec(source);
  return match?.[1] ?? "1.0.0";
}

function extractDisplayName(source: string): string {
  const match = /displayName:\s*["']([^"']+)["']/.exec(source);
  return match?.[1] ?? "(unknown)";
}

function replaceVersion(source: string, newVersion: string): string {
  return source.replace(
    /(version:\s*["'])([^"']+)(["'])/,
    `$1${newVersion}$3`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const templateId = process.argv[2];
  if (!templateId) {
    console.error("Usage: pnpm publish-template <template-id>");
    process.exit(1);
  }

  const templateDir = path.join(templatesRoot, templateId);
  if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
    console.error(
      `Template not found: ${templateDir}\n` +
        `Ensure the template exists under packages/templates/src/${templateId}/`,
    );
    process.exit(1);
  }

  const manifestPath = path.join(templateDir, "manifest.ts");
  if (!existsSync(manifestPath)) {
    console.error(`Missing manifest.ts in ${templateDir}`);
    process.exit(1);
  }

  const source = readFileSync(manifestPath, "utf8");
  const currentVersion = extractVersion(source);
  const displayName = extractDisplayName(source);
  const nextVersion = bumpPatchVersion(currentVersion);

  const updated = replaceVersion(source, nextVersion);
  writeFileSync(manifestPath, updated, "utf8");

  console.log(
    `Published "${displayName}" (${templateId}): v${currentVersion} → v${nextVersion}`,
  );
}

main();
