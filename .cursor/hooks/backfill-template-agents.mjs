#!/usr/bin/env node
// Cursor hook: after any Write-tool file edit, scan packages/templates/src/*
// for template directories missing AGENTS.md and generate it automatically.
//
// This guarantees every template folder gets its AI-isolation sandbox rules
// (packages/templates/scripts/create-template.mjs is the single source of
// truth for the rules content) even when a template is scaffolded manually
// or by an agent writing files directly, instead of via the CLI script.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  // Drain stdin so the hook protocol doesn't stall; we don't need its contents
  // because a full re-scan of the (small) templates directory is cheap.
  await drainStdin();

  const projectRoot = process.cwd();
  const generatorPath = path.join(
    projectRoot,
    "packages",
    "templates",
    "scripts",
    "create-template.mjs"
  );

  if (!fs.existsSync(generatorPath)) {
    // Not running inside the mashedgames-studio repo (or layout changed) - no-op.
    process.exit(0);
  }

  const { buildAgentsFile, SRC_ROOT, TEMPLATE_ID_PATTERN } = await import(
    pathToFileURL(generatorPath).href
  );

  if (!fs.existsSync(SRC_ROOT)) {
    process.exit(0);
  }

  const created = [];

  for (const entry of fs.readdirSync(SRC_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const templateId = entry.name;
    if (!TEMPLATE_ID_PATTERN.test(templateId)) continue;

    const templateDir = path.join(SRC_ROOT, templateId);
    const manifestPath = path.join(templateDir, "manifest.ts");
    const agentsPath = path.join(templateDir, "AGENTS.md");

    const hasManifest = fs.existsSync(manifestPath);
    const hasAgentsFile = fs.existsSync(agentsPath);

    if (hasManifest && !hasAgentsFile) {
      fs.writeFileSync(agentsPath, buildAgentsFile(templateId), "utf8");
      created.push(path.join("packages/templates/src", templateId, "AGENTS.md"));
    }
  }

  if (created.length > 0 && process.env.NODE_ENV !== "production") {
    process.stderr.write(
      `[backfill-template-agents] Generated: ${created.join(", ")}\n`
    );
  }

  process.exit(0);
}

function drainStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve();
      return;
    }
    let data = "";
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
    // Safety net in case stdin never closes in some hook environments.
    setTimeout(resolve, 200);
  });
}

main().catch((error) => {
  process.stderr.write(`[backfill-template-agents] Error: ${error?.stack || error}\n`);
  // Fail open: never block file edits because of this convenience hook.
  process.exit(0);
});
