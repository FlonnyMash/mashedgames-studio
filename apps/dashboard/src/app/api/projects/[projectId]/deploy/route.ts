import { loadProject } from "@/lib/project-io";
import { resolveProjectOwnerContext } from "@/lib/project-owner-context";
import { PROJECT_FILES, resolveProjectDir } from "@/lib/project-paths";
import { exportTemplateToDirectory } from "@/lib/template-export";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import simpleGit from "simple-git";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const deployUrl =
    process.env.DEPLOY_REPO_URL ?? process.env.GITHUB_DEPLOY_REPO_URL;

  if (!deployUrl) {
    return Response.json(
      {
        ok: false,
        error:
          "Deploy is not configured. Set DEPLOY_REPO_URL in apps/dashboard/.env.local.",
      },
      { status: 500 },
    );
  }

  let tempDir: string | null = null;

  try {
    const ownerContext = await resolveProjectOwnerContext(request);
    const loaded = await loadProject(projectId, ownerContext);
    if (!loaded.ok) {
      return Response.json(
        { ok: false, error: loaded.error },
        { status: loaded.status },
      );
    }

    const { manifest, config } = loaded.data;
    const perProjectUrl = manifest.deployRepoUrl ?? deployUrl;

    tempDir = await mkdtemp(path.join(os.tmpdir(), "mashedgames-deploy-"));

    const projectAssetsDir = path.join(
      resolveProjectDir(projectId),
      PROJECT_FILES.assetsDir,
    );

    const exported = await exportTemplateToDirectory(
      manifest.parentTemplateId,
      tempDir,
    );

    if (!exported.ok) {
      return Response.json(
        { ok: false, error: exported.error },
        { status: exported.status },
      );
    }

    const git = simpleGit(tempDir);
    await git.init();
    await git.add(".");
    await git.commit("Auto-deploy from Configurator");
    await git.addRemote("origin", perProjectUrl);
    await git.push(["-u", "-f", "origin", "main"]);

    return Response.json({
      ok: true,
      success: true,
      message: "Pushed to repository successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.includes("Authentication")
          ? "Git authentication failed. Check deploy credentials."
          : error.message
        : "Deploy failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
