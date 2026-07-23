import {
  buildProjectStaticBundle,
  deployDirectoryToCloudflarePages,
} from "@/lib/cloudflare-deploy";
import { ensureClaimedGameRow, resolveSourceTemplateId } from "@/lib/games-claim";
import { loadProject, persistProjectGameId } from "@/lib/project-io";
import { resolveProjectOwnerContext } from "@/lib/project-owner-context";
import {
  createAnonSupabaseClient,
  extractBearerToken,
  getSupabaseRuntimeEnv,
} from "@/lib/supabase-auth";
import { loadCloudflareDeployEnv } from "@mashedgames/shared";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * A full engine copy + Wrangler Pages upload can take a couple of minutes.
 * Honoured by serverless hosts; local Next.js relies on the wrangler timeout.
 */
export const maxDuration = 300;

type RouteContext = { params: Promise<{ projectId: string }> };

/**
 * Resolve the Supabase `public.games.id` for this project, minting one if the
 * project doesn't have it yet (e.g. its creation-time claim failed, or it's a
 * legacy save). Persists a freshly-minted id to `project.json` / `client.json`
 * so the deployed bundle embeds it and the webhook panel unlocks.
 *
 * Never throws and never blocks the deploy: a Supabase hiccup simply returns the
 * existing (possibly null) id, mirroring the non-fatal pattern in projects/create.
 */
async function resolveDeployGameId(
  request: NextRequest,
  projectId: string,
  manifest: { gameId?: string; parentTemplateId: string },
  ownerContext: { ownerId: string } | null,
): Promise<string | null> {
  const existing = manifest.gameId ?? null;
  if (existing) {
    return existing;
  }
  if (!ownerContext) {
    return null;
  }

  try {
    const bearerToken = extractBearerToken(request.headers.get("Authorization"));
    if (!bearerToken) {
      return null;
    }

    const supabase = createAnonSupabaseClient(
      getSupabaseRuntimeEnv(),
      bearerToken,
    );
    const sourceTemplateId = await resolveSourceTemplateId(
      supabase,
      manifest.parentTemplateId,
    );

    const claimed = await ensureClaimedGameRow(supabase, {
      ownerId: ownerContext.ownerId,
      slug: projectId,
      templateId: sourceTemplateId,
    });
    if (!claimed.ok) {
      console.warn(
        `[projects/deploy] Could not resolve gameId (non-fatal): ${claimed.error}`,
      );
      return null;
    }

    const gameId = claimed.game.id;
    const persisted = await persistProjectGameId(projectId, gameId, ownerContext);
    if (!persisted.ok) {
      console.warn(
        `[projects/deploy] Could not persist gameId (non-fatal): ${persisted.error}`,
      );
    }
    return gameId;
  } catch (error) {
    console.warn(
      "[projects/deploy] gameId resolution threw (non-fatal):",
      error instanceof Error ? error.message : String(error),
    );
    return existing;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;

  const cfEnv = loadCloudflareDeployEnv();
  if (!cfEnv.ok) {
    return Response.json({ ok: false, error: cfEnv.error }, { status: 500 });
  }

  let bundleDir: string | null = null;

  try {
    const ownerContext = await resolveProjectOwnerContext(request);
    const loaded = await loadProject(projectId, ownerContext);
    if (!loaded.ok) {
      return Response.json(
        { ok: false, error: loaded.error },
        { status: loaded.status },
      );
    }

    // Resolve (and persist) the Supabase games.id BEFORE bundling so the
    // exported config.json ships with it and captured leads attribute correctly.
    const gameId = await resolveDeployGameId(
      request,
      projectId,
      loaded.data.manifest,
      ownerContext,
    );

    bundleDir = await mkdtemp(path.join(os.tmpdir(), "mashedgames-deploy-"));

    const built = await buildProjectStaticBundle(
      projectId,
      ownerContext,
      bundleDir,
    );
    if (!built.ok) {
      return Response.json(
        { ok: false, error: built.error },
        { status: built.status },
      );
    }

    const deployed = await deployDirectoryToCloudflarePages(
      bundleDir,
      cfEnv.env,
    );
    if (!deployed.ok) {
      return Response.json(
        { ok: false, error: deployed.error },
        { status: deployed.status },
      );
    }

    return Response.json({
      ok: true,
      success: true,
      url: deployed.url,
      gameId,
      message: `Deployed to Cloudflare Pages: ${deployed.url}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Deploy failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  } finally {
    if (bundleDir) {
      await rm(bundleDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }
}
