import { assertClientLogoWithinSize } from "@/lib/project-assets";
import { createProject } from "@/lib/project-io";
import { ensureClaimedGameRow, resolveSourceTemplateId } from "@/lib/games-claim";
import {
  createAnonSupabaseClient,
  extractBearerToken,
  getSupabaseRuntimeEnv,
  verifyAuthenticatedCaller,
} from "@/lib/supabase-auth";
import {
  normalizeTemplateId,
  slugifyProjectId,
  type GameTemplateId,
} from "@mashedgames/shared";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const LOGO_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

type CreateProjectBody = {
  displayName?: string;
  parentTemplateId?: string;
  projectId?: string;
  clientName?: string;
};

async function parseJsonBody(request: NextRequest): Promise<CreateProjectBody> {
  return (await request.json()) as CreateProjectBody;
}

async function parseMultipartBody(
  request: NextRequest,
): Promise<{
  body: CreateProjectBody;
  clientLogo?: { buffer: Buffer; fileName: string };
}> {
  const formData = await request.formData();
  const body: CreateProjectBody = {
    displayName:
      typeof formData.get("displayName") === "string"
        ? formData.get("displayName")
        : undefined,
    parentTemplateId:
      typeof formData.get("parentTemplateId") === "string"
        ? formData.get("parentTemplateId")
        : undefined,
    projectId:
      typeof formData.get("projectId") === "string"
        ? formData.get("projectId")
        : undefined,
    clientName:
      typeof formData.get("clientName") === "string"
        ? formData.get("clientName")
        : undefined,
  };

  const logoFile = formData.get("clientLogo");
  if (!(logoFile instanceof File) || logoFile.size === 0) {
    return { body };
  }

  if (!LOGO_MIME_TYPES.has(logoFile.type)) {
    throw new Error("Client logo must be PNG, JPG, WEBP, SVG, or GIF.");
  }

  assertClientLogoWithinSize(logoFile.size);

  return {
    body,
    clientLogo: {
      buffer: Buffer.from(await logoFile.arrayBuffer()),
      fileName: logoFile.name,
    },
  };
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  let body: CreateProjectBody;
  let clientLogo: { buffer: Buffer; fileName: string } | undefined;

  try {
    if (contentType.includes("multipart/form-data")) {
      const parsed = await parseMultipartBody(request);
      body = parsed.body;
      clientLogo = parsed.clientLogo;
    } else {
      body = await parseJsonBody(request);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request body.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }

  if (!body.displayName?.trim()) {
    return Response.json(
      { ok: false, error: "displayName is required." },
      { status: 400 },
    );
  }

  const requestedTemplateId = normalizeTemplateId(body.parentTemplateId);
  if (!requestedTemplateId) {
    return Response.json(
      { ok: false, error: "parentTemplateId is required." },
      { status: 400 },
    );
  }

  try {
    const bearerToken = extractBearerToken(request.headers.get("Authorization"));
    if (!bearerToken) {
      return Response.json(
        { ok: false, error: "Authentication required." },
        { status: 401 },
      );
    }

    const runtimeEnv = getSupabaseRuntimeEnv();
    const caller = await verifyAuthenticatedCaller(bearerToken, runtimeEnv);
    if ("error" in caller) {
      return Response.json(
        { ok: false, error: caller.error },
        { status: caller.status },
      );
    }

    // Resolve (idempotently) the Supabase games.id for this owner + template so
    // the project persists a durable link. Non-fatal: a lookup failure must not
    // block project creation — the project is simply created without a gameId.
    let gameId: string | undefined;
    try {
      const supabase = createAnonSupabaseClient(runtimeEnv, bearerToken);

      // parentTemplateId is the engine template slug (e.g. "lucky-wheel"), but
      // games.source_template_id is a uuid FK to public.templates(id). Resolve
      // the slug to the registry uuid; if the template isn't published to the
      // registry, fall back to undefined so the games row is still created
      // (webhooks work) — just without the storefront ownership link.
      const sourceTemplateId = await resolveSourceTemplateId(
        supabase,
        requestedTemplateId,
      );

      const gameResult = await ensureClaimedGameRow(supabase, {
        ownerId: caller.userId,
        slug: body.projectId?.trim() || slugifyProjectId(body.displayName),
        templateId: sourceTemplateId,
      });
      if (gameResult.ok) {
        gameId = gameResult.game.id;
      } else {
        console.warn(
          `[projects/create] Could not resolve gameId (non-fatal): ${gameResult.error}`,
        );
      }
    } catch (error) {
      console.warn(
        "[projects/create] gameId resolution threw (non-fatal):",
        error instanceof Error ? error.message : String(error),
      );
    }

    const result = await createProject({
      displayName: body.displayName,
      parentTemplateId: requestedTemplateId as GameTemplateId,
      projectId: body.projectId,
      clientName: body.clientName,
      clientLogo,
      ownerId: caller.userId,
      gameId,
    });

    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error },
        { status: result.status },
      );
    }

    return Response.json({
      ok: true,
      projectId: result.data.manifest.projectId,
      manifest: result.data.manifest,
      client: result.data.client,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create project.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
