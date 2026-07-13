import {
  extractBearerToken,
  getSupabaseRuntimeEnv,
  verifyAuthenticatedCaller,
} from "@/lib/supabase-auth";

export type ProjectOwnerContext = {
  ownerId: string;
  role: "studio_admin" | "b2b_user";
};

export async function resolveProjectOwnerContext(
  request: Request,
): Promise<ProjectOwnerContext | null> {
  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (!bearerToken) {
    return null;
  }

  const caller = await verifyAuthenticatedCaller(
    bearerToken,
    getSupabaseRuntimeEnv(),
  );
  if ("error" in caller) {
    return null;
  }

  return { ownerId: caller.userId, role: caller.role };
}
