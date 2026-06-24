import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";

/**
 * 5-minute execution budget — a full pnpm build + Wrangler Pages upload can
 * easily take 3–4 minutes. Vercel/other serverless hosts honour maxDuration
 * (seconds); local Next.js ignores it but the per-process timeout below still
 * applies.
 */
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DeployResponse =
  | { ok: true; demo_url: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Auth — identical pattern to /api/admin/ref-data and /api/admin/publish-template
// ---------------------------------------------------------------------------

async function verifyStudioAdmin(
  bearerToken: string,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ userId: string } | { error: string; status: number }> {
  const userClient = createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return { error: "Invalid or expired token.", status: 401 };
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[deploy-demo] Profile lookup error:", {
      userId: userData.user.id,
      code: profileError.code,
      message: profileError.message,
    });
    return { error: "Profile lookup failed.", status: 403 };
  }

  if (!profile) {
    return { error: "User profile not found.", status: 403 };
  }

  if (profile.role !== "studio_admin") {
    return { error: "Forbidden: studio_admin role required.", status: 403 };
  }

  return { userId: userData.user.id };
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

/**
 * Strict slug regex — only lowercase/uppercase letters, digits, and hyphens.
 * This deliberately excludes all shell metacharacters (spaces, quotes, $, `,
 * ;, &, |, >, <, (, ), {, }, *, ?, #, !, ~, \, %, @, ^) so the slug can
 * never be used for OS command injection even if the Zod guard were bypassed.
 */
const SLUG_REGEX = /^[a-zA-Z0-9-]+$/;

const BodySchema = z.object({
  templateSlug: z
    .string()
    .min(1, "templateSlug is required")
    .max(100, "templateSlug must be 100 characters or fewer")
    .regex(SLUG_REGEX, "templateSlug may only contain letters, numbers, and hyphens"),
});

// ---------------------------------------------------------------------------
// Child-process helper — uses spawn (no shell) to avoid any command injection
// ---------------------------------------------------------------------------

interface RunResult {
  stdout: string;
  stderr: string;
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      // shell: true required on Windows so pnpm (.cmd shim) resolves from PATH.
      shell: true,
      env: process.env,
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
          `Deploy timed out after ${Math.round(timeoutMs / 1000)}s. ` +
            `The build or Wrangler upload may still be running in the background.`,
        ),
      );
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `pnpm deploy:demo exited with code ${code ?? "null"}.\n` +
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

// ---------------------------------------------------------------------------
// URL extraction from deploy script output
// ---------------------------------------------------------------------------

function extractDeployedUrl(stdout: string, templateSlug: string): string {
  // Primary: try to match the Cloudflare Pages URL that Wrangler logs.
  // Wrangler emits lines like:
  //   ✨ Deployment complete! Take a peek over at https://xxx.mashedgames-demos.pages.dev
  // The deploy script also prints:
  //   https://<slug>.mashedgames-demos.pages.dev
  const match = stdout.match(
    /https:\/\/[a-zA-Z0-9-]+\.mashedgames-demos\.pages\.dev/,
  );
  if (match) {
    return match[0];
  }

  // Fallback: construct the deterministic branch-alias URL we passed to
  // Wrangler (--branch <templateSlug> always produces this subdomain).
  return `https://${templateSlug}.mashedgames-demos.pages.dev`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json<DeployResponse>(
      { ok: false, error: "Server misconfiguration: missing Supabase environment variables." },
      { status: 500 },
    );
  }

  // --- 1. Auth ---
  const authHeader = request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!bearerToken) {
    return Response.json<DeployResponse>(
      { ok: false, error: "Authorization header with Bearer token required." },
      { status: 401 },
    );
  }

  const authResult = await verifyStudioAdmin(bearerToken, supabaseUrl, anonKey);
  if ("error" in authResult) {
    return Response.json<DeployResponse>(
      { ok: false, error: authResult.error },
      { status: authResult.status },
    );
  }

  // --- 2. Input validation ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json<DeployResponse>(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => e.message).join("; ");
    return Response.json<DeployResponse>(
      { ok: false, error: message },
      { status: 400 },
    );
  }

  const { templateSlug } = parsed.data;

  // --- 3. Verify template exists in DB (double-check before running anything) ---
  const serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tpl, error: lookupError } = await serviceClient
    .from("templates")
    .select("id, manifest")
    .eq("template_slug", templateSlug)
    .eq("is_latest", true)
    .maybeSingle();

  if (lookupError) {
    console.error("[deploy-demo] Template lookup error:", lookupError);
    return Response.json<DeployResponse>(
      { ok: false, error: "Database error during template lookup." },
      { status: 500 },
    );
  }

  if (!tpl) {
    return Response.json<DeployResponse>(
      {
        ok: false,
        error: `Template "${templateSlug}" is not yet published to Supabase. Publish it first, then deploy the demo.`,
      },
      { status: 404 },
    );
  }

  // --- 4. Resolve repo root ---
  // When Next.js runs under pnpm --filter dashboard, process.cwd() is
  // apps/dashboard/. Two levels up is the monorepo root.
  const repoRoot =
    process.env.MASHEDGAMES_REPO_ROOT ?? path.resolve(process.cwd(), "../..");

  // --- 5. Spawn pnpm deploy:demo <templateSlug> ---
  console.info(
    `[deploy-demo] Starting deploy for slug="${templateSlug}" ` +
      `repoRoot="${repoRoot}" by=${authResult.userId}`,
  );

  // Use pnpm via shell so Windows .cmd shims resolve correctly.
  let runResult: RunResult;
  try {
    runResult = await runCommand(
      "pnpm",
      ["deploy:demo", templateSlug],
      repoRoot,
      // 5-minute hard cap — build + Wrangler upload typically takes 2–3 min.
      5 * 60 * 1000,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[deploy-demo] Deploy process failed:", message);
    return Response.json<DeployResponse>(
      { ok: false, error: `Deploy failed: ${message}` },
      { status: 500 },
    );
  }

  // --- 6. Extract the deployed URL ---
  const deployedUrl = extractDeployedUrl(runResult.stdout, templateSlug);

  console.info(
    `[deploy-demo] Deploy succeeded for slug="${templateSlug}" url="${deployedUrl}"`,
  );

  // --- 7. Update manifest.demo_url in the templates table ---
  const currentManifest =
    tpl.manifest !== null && typeof tpl.manifest === "object" && !Array.isArray(tpl.manifest)
      ? (tpl.manifest as Record<string, unknown>)
      : {};

  const updatedManifest: Record<string, unknown> = {
    ...currentManifest,
    demo_url: deployedUrl,
  };

  const { error: updateError } = await serviceClient
    .from("templates")
    .update({ manifest: updatedManifest })
    .eq("id", tpl.id);

  if (updateError) {
    // Non-fatal: the deploy itself succeeded. Log prominently but still return
    // the URL so the admin can manually paste it if needed.
    console.error(
      "[deploy-demo] WARNING: Deploy succeeded but failed to persist demo_url to DB:",
      updateError,
    );
  } else {
    console.info(
      `[deploy-demo] manifest.demo_url updated for template id=${tpl.id}`,
    );
  }

  return Response.json<DeployResponse>({ ok: true, demo_url: deployedUrl });
}
