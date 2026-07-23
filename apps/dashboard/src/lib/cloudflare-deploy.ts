import { spawn } from "node:child_process";
import { cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CloudflareDeployEnv } from "@mashedgames/shared";
import { buildProjectExportConfigJson } from "@/lib/project-export-config";
import type { ProjectOwnerContext } from "@/lib/project-owner-context";
import { PROJECT_FILES, resolveProjectDir } from "@/lib/project-paths";
import { dashboardEnginePublicRoot } from "@/lib/template-library-root";

/**
 * Subdirectory holding promotional/editorial meta assets (thumbnails,
 * previews). These must never ship inside a deployed game bundle.
 */
const META_SUBDIR_NAME = "meta";

export type BundleResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Assemble a static, self-contained game bundle for the given project into
 * `destDir`. Layout mirrors the desktop exporter (apps/desktop/export-ipc-utils.js):
 *
 *   destDir/
 *     index.html + engine assets  (copied from apps/dashboard/public/engine)
 *     config.json                 (flat GameConfig — engine self-loads via fetch)
 *     assets/                     (project binary assets, excluding meta/)
 *
 * All reads are constrained to MASHEDGAMES_WORKSPACE_PATH via resolveProjectDir.
 */
export async function buildProjectStaticBundle(
  projectId: string,
  ownerContext: ProjectOwnerContext | null,
  destDir: string,
): Promise<BundleResult> {
  const engineDir = dashboardEnginePublicRoot;
  if (!existsSync(engineDir)) {
    return {
      ok: false,
      error:
        "Game engine bundle not found. Run `pnpm run build:engine` to populate apps/dashboard/public/engine.",
      status: 500,
    };
  }

  const configResult = await buildProjectExportConfigJson(
    projectId,
    ownerContext,
  );
  if (!configResult.ok) {
    return configResult;
  }

  await mkdir(destDir, { recursive: true });

  // 1. Engine bundle (index.html + hashed assets) at the bundle root.
  await cp(engineDir, destDir, { recursive: true });

  // 2. Flat GameConfig snapshot — loaded by the engine via fetch("./config.json").
  await writeFile(
    path.join(destDir, "config.json"),
    configResult.configJson,
    "utf8",
  );

  // 3. Project assets (skipping meta/ promotional files).
  const assetsDir = path.join(
    resolveProjectDir(projectId),
    PROJECT_FILES.assetsDir,
  );
  if (existsSync(assetsDir) && (await stat(assetsDir)).isDirectory()) {
    const destAssetsDir = path.join(destDir, PROJECT_FILES.assetsDir);
    await copyAssetsExcludingMeta(assetsDir, destAssetsDir);
  }

  return { ok: true };
}

async function copyAssetsExcludingMeta(
  srcDir: string,
  destDir: string,
): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true });
  await mkdir(destDir, { recursive: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === META_SUBDIR_NAME) {
      continue;
    }
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyAssetsExcludingMeta(src, dest);
    } else if (entry.isFile()) {
      await cp(src, dest);
    }
  }
}

export type DeployResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number };

const WRANGLER_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Deploy a prepared static directory to Cloudflare Pages using
 * `npx wrangler pages deploy <dir> --project-name <name>`. Credentials are
 * passed via env (never on the command line). Returns the deployment URL
 * parsed from wrangler stdout.
 */
export async function deployDirectoryToCloudflarePages(
  dir: string,
  env: CloudflareDeployEnv,
): Promise<DeployResult> {
  try {
    const { stdout, stderr } = await runWrangler(
      [
        "wrangler",
        "pages",
        "deploy",
        dir,
        "--project-name",
        env.CLOUDFLARE_CLIENT_PROJECT_NAME,
      ],
      {
        ...process.env,
        CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      },
    );

    const url = parseDeploymentUrl(`${stdout}\n${stderr}`);
    if (!url) {
      return {
        ok: false,
        error:
          "Deploy completed but no Cloudflare Pages URL could be parsed from the output.",
        status: 502,
      };
    }
    return { ok: true, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isAuthError(message)) {
      return {
        ok: false,
        error:
          "Cloudflare authentication failed. Check CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.",
        status: 502,
      };
    }
    return { ok: false, error: `Cloudflare deploy failed: ${message}`, status: 502 };
  }
}

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    lower.includes("10000") ||
    lower.includes("invalid api token") ||
    lower.includes("could not route to")
  );
}

/**
 * Wrangler prints the live deployment URL as the last https://*.pages.dev
 * link in its output (e.g. "✨ Deployment complete! Take a peek over at
 * https://<hash>.<project>.pages.dev").
 */
function parseDeploymentUrl(output: string): string | null {
  const matches = output.match(/https:\/\/[^\s"']+\.pages\.dev[^\s"']*/g);
  if (!matches || matches.length === 0) {
    return null;
  }
  return matches[matches.length - 1].replace(/[.,)]+$/, "");
}

interface RunResult {
  stdout: string;
  stderr: string;
}

function runWrangler(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // shell: true required on Windows so the npx (.cmd shim) resolves from PATH.
    const child = spawn("npx", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `Cloudflare deploy timed out after ${Math.round(
            WRANGLER_TIMEOUT_MS / 1000,
          )}s. The upload may still be running in the background.`,
        ),
      );
    }, WRANGLER_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `wrangler exited with code ${code ?? "null"}.\n` +
              `stderr: ${stderr.slice(-2000)}\n` +
              `stdout: ${stdout.slice(-2000)}`,
          ),
        );
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
