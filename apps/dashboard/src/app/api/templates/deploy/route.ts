import { loadProject } from "@/lib/project-io";
import { resolveProjectOwnerContext } from "@/lib/project-owner-context";
import { PROJECT_FILES, resolveProjectDir } from "@/lib/project-paths";
import { exportTemplateToDirectory } from "@/lib/template-export";
import {
  GameConfigSchema,
  normalizeGameConfig,
  type GameConfig,
} from "@mashedgames/shared";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import simpleGit from "simple-git";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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
    const body = (await request.json()) as {
      projectId?: string;
      templateId?: string;
      config?: unknown;
    };

    let templateId: string;
    let config: GameConfig | undefined;

    if (body.projectId) {
      const ownerContext = await resolveProjectOwnerContext(request);
      const loaded = await loadProject(body.projectId, ownerContext);
      if (!loaded.ok) {
        return Response.json(
          { ok: false, error: loaded.error },
          { status: loaded.status },
        );
      }
      templateId = loaded.data.manifest.parentTemplateId;
      config = loaded.data.config;
    } else if (body.templateId && body.config) {
      const normalized = normalizeGameConfig(body.config);
      const parsed = GameConfigSchema.safeParse({
        ...normalized,
        activeTemplateId: body.templateId,
      });
      if (!parsed.success) {
        return Response.json(
          { ok: false, error: "Invalid config." },
          { status: 400 },
        );
      }
      templateId = body.templateId;
      config = parsed.data;
    } else {
      return Response.json(
        { ok: false, error: "Provide projectId or templateId with config." },
        { status: 400 },
      );
    }

    tempDir = await mkdtemp(path.join(os.tmpdir(), "mashedgames-deploy-"));

    const projectAssetsDir =
      body.projectId !== undefined
        ? path.join(
            resolveProjectDir(body.projectId),
            PROJECT_FILES.assetsDir,
          )
        : undefined;

    const exported = await exportTemplateToDirectory(templateId, tempDir);
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
    await git.addRemote("origin", deployUrl);
    await git.push(["-u", "-f", "origin", "main"]);

    return Response.json({
      ok: true,
      success: true,
      message: "Pushed to repository successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.includes("Authentication") ||
          error.message.includes("authentication")
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
