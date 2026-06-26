"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, LogOut, User } from "lucide-react";
import { supabase, type Tables } from "@/lib/supabaseClient";
import { getProfileViaIpc, wipePersistedTokensViaIpc } from "@/lib/auth-ipc";
import { useAuthStore } from "@/store/useAuthStore";
import { RoleGate } from "./RoleGate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrgRow = Pick<Tables<"organizations">, "name" | "plan">;

type FetchState =
  | { status: "loading" }
  | {
      status: "success";
      org: OrgRow | null;
      /**
       * Role resolved via the `auth:get-profile` IPC channel (Electron path
       * only). Undefined on the web path — the store's `role` value is used
       * instead. `null` means the user has no role set in the DB.
       */
      ipcRole?: Tables<"profiles">["role"] | null;
    }
  | { status: "error" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAN_LABELS: Record<Tables<"organizations">["plan"], string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

const ROLE_LABELS: Record<Tables<"profiles">["role"], string> = {
  studio_admin: "Studio Admin",
  b2b_user: "Partner",
};

// ---------------------------------------------------------------------------
// Skeleton sub-component
// ---------------------------------------------------------------------------

function FieldSkeleton() {
  return <span className="inline-block h-4 w-28 animate-pulse rounded bg-zinc-200" />;
}

// ---------------------------------------------------------------------------
// Auth-error detector
// ---------------------------------------------------------------------------

/**
 * Returns true when a PostgREST / Supabase error signals that the caller's
 * JWT is invalid or expired. Used to trigger the auto-healing logout flow
 * instead of showing a generic error banner.
 *
 * Covered cases:
 *   - HTTP 401 mapped to PostgREST code "PGRST301" (JWT expired)
 *   - Any message that explicitly references JWT invalidity / expiry
 *   - Generic "not authenticated" / "unauthorized" messages
 */
function isAuthError(error: { code?: string; message?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  return (
    code === "pgrst301" ||
    msg.includes("jwt expired") ||
    msg.includes("jwt invalid") ||
    msg.includes("invalid jwt") ||
    msg.includes("not authenticated") ||
    msg.includes("unauthorized")
  );
}

// ---------------------------------------------------------------------------
// ProfilePanel
// ---------------------------------------------------------------------------

/**
 * Displays authenticated user data: email, role, organisation name and plan.
 * Fetches organisation details on mount via a single profles→organizations join.
 * Renders a skeleton loader while fetching and an error state on failure.
 * Includes a Logout button and an Admin Panel link gated by RoleGate.
 *
 * Drop into any Sidebar or Header — the card is self-contained.
 */
export function ProfilePanel() {
  const router = useRouter();
  const email = useAuthStore((s) => s.email);
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.userId);

  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // ---------------------------------------------------------------------------
  // Fail-safe logout — guaranteed to clear local state and redirect even when
  // the remote sign-out call is rejected (e.g. 401, network error, zombie JWT).
  // Each remote operation is wrapped in its own try/catch so a failure in one
  // never skips the others or the mandatory local wipe + redirect at the end.
  // ---------------------------------------------------------------------------

  const performFailSafeLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("[ProfilePanel] supabase.auth.signOut failed (ignored):", err);
    }
    try {
      await wipePersistedTokensViaIpc();
    } catch (err) {
      console.warn("[ProfilePanel] wipePersistedTokensViaIpc failed (ignored):", err);
    }
    // These two lines are unconditional — they run regardless of what the
    // remote calls above returned.
    useAuthStore.getState().clearSession();
    router.replace("/login");
  }, [router]);

  // ---------------------------------------------------------------------------
  // Profile fetch on mount.
  //
  // Electron path  — `window.electron` is present.
  //   The renderer's Supabase client is anonymous; the JWT lives exclusively
  //   in the main process.  Fetching via `auth:get-profile` IPC lets the main
  //   process run the query with the user's JWT so RLS is satisfied.
  //
  // Web path — `window.electron` is absent.
  //   The browser holds its own session; the renderer's Supabase client is
  //   authenticated and can query directly.
  //
  // When `userId` is null the fetch is skipped entirely (the auth store has
  // not been populated yet, which can happen transiently during boot).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!userId) {
      setFetchState({ status: "success", org: null });
      return;
    }

    let cancelled = false;

    void (async () => {
      if (window.electron) {
        // ── Electron path ────────────────────────────────────────────────
        const result = await getProfileViaIpc();

        if (cancelled) return;

        if (!result) {
          // IPC bridge unexpectedly returned null — treat as transient error.
          setFetchState({ status: "error" });
          return;
        }

        if (!result.ok) {
          // Auth errors (session wiped, JWT invalid) force a logout regardless
          // of cancellation — the session is globally broken.
          if (isAuthError({ message: result.error })) {
            console.warn("[ProfilePanel] Auth error via IPC — forcing logout:", result.error);
            await performFailSafeLogout();
            return;
          }
          console.error("[ProfilePanel] IPC profile fetch failed:", result.error);
          setFetchState({ status: "error" });
          return;
        }

        const rawOrg = result.profile.org;
        const org: OrgRow | null = rawOrg
          ? (rawOrg as OrgRow)
          : null;

        setFetchState({
          status: "success",
          org,
          ipcRole: result.profile.role as Tables<"profiles">["role"] | null,
        });
      } else {
        // ── Web path ─────────────────────────────────────────────────────
        const { data, error } = await supabase
          .from("profiles")
          .select("organizations(name, plan)")
          .eq("id", userId)
          .maybeSingle();

        // Auth errors trigger recovery before the cancelled guard — the token
        // is globally invalid so the redirect must fire even if unmounted.
        if (error && isAuthError(error)) {
          console.warn("[ProfilePanel] Auth error on profile fetch — forcing logout:", error);
          await performFailSafeLogout();
          return;
        }

        if (cancelled) return;

        if (error) {
          console.error("[ProfilePanel] Failed to fetch organisation:", error);
          setFetchState({ status: "error" });
          return;
        }

        const raw = data?.organizations;
        const org: OrgRow | null =
          raw && !Array.isArray(raw) ? (raw as OrgRow) : null;

        setFetchState({ status: "success", org });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, performFailSafeLogout]);

  // ---------------------------------------------------------------------------
  // Logout handler — delegates to performFailSafeLogout so the spinner state
  // is the only concern here; all safety guarantees live in the shared helper.
  // ---------------------------------------------------------------------------

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await performFailSafeLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleRetry = () => {
    setFetchState({ status: "loading" });
    if (!userId) {
      setFetchState({ status: "success", org: null });
      return;
    }
    void (async () => {
      if (window.electron) {
        // Electron path — re-fetch via IPC.
        const result = await getProfileViaIpc();

        if (!result) {
          setFetchState({ status: "error" });
          return;
        }

        if (!result.ok) {
          if (isAuthError({ message: result.error })) {
            console.warn("[ProfilePanel] Auth error on IPC retry — forcing logout:", result.error);
            await performFailSafeLogout();
            return;
          }
          console.error("[ProfilePanel] IPC retry failed:", result.error);
          setFetchState({ status: "error" });
          return;
        }

        const rawOrg = result.profile.org;
        const org: OrgRow | null = rawOrg ? (rawOrg as OrgRow) : null;

        setFetchState({
          status: "success",
          org,
          ipcRole: result.profile.role as Tables<"profiles">["role"] | null,
        });
      } else {
        // Web path — direct Supabase query.
        const { data, error } = await supabase
          .from("profiles")
          .select("organizations(name, plan)")
          .eq("id", userId)
          .maybeSingle();

        if (error && isAuthError(error)) {
          console.warn("[ProfilePanel] Auth error on retry — forcing logout:", error);
          await performFailSafeLogout();
          return;
        }

        if (error) {
          console.error("[ProfilePanel] Retry: failed to fetch organisation:", error);
          setFetchState({ status: "error" });
          return;
        }

        const raw = data?.organizations;
        const org: OrgRow | null =
          raw && !Array.isArray(raw) ? (raw as OrgRow) : null;

        setFetchState({ status: "success", org });
      }
    })();
  };

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------

  const displayEmail = email ?? "—";

  // In Electron, `role` from the auth store is always null (tokens are in the
  // main process).  `ipcRole` is populated by the auth:get-profile IPC fetch
  // and takes precedence when available.
  const ipcRole =
    fetchState.status === "success" && "ipcRole" in fetchState
      ? fetchState.ipcRole
      : undefined;
  const effectiveRole = ipcRole !== undefined ? ipcRole : role;
  const displayRole = effectiveRole ? (ROLE_LABELS[effectiveRole] ?? effectiveRole) : "—";

  const isLoading = fetchState.status === "loading";
  const isError = fetchState.status === "error";
  const org = fetchState.status === "success" ? fetchState.org : null;

  const displayOrg = isLoading ? null : org?.name ?? "—";
  const displayPlan = isLoading
    ? null
    : org?.plan
      ? (PLAN_LABELS[org.plan] ?? org.plan)
      : "—";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full min-w-[260px] max-w-sm rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {/* Header row */}
      <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <User className="h-4 w-4 text-zinc-500" aria-hidden />
        </span>
        <span
          className="truncate text-sm font-medium text-zinc-900"
          title={displayEmail}
        >
          {displayEmail}
        </span>
      </div>

      {/* Error banner */}
      {isError ? (
        <div className="mx-5 mt-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-xs text-red-700">Failed to load profile.</p>
          <button
            type="button"
            onClick={handleRetry}
            className="ml-3 text-xs font-medium text-red-700 underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Fields */}
      <dl className="space-y-3 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <dt className="shrink-0 text-xs font-medium text-zinc-500">Role</dt>
          <dd className="text-right text-xs text-zinc-800">{displayRole}</dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="shrink-0 text-xs font-medium text-zinc-500">Organisation</dt>
          <dd className="text-right text-xs text-zinc-800">
            {isLoading ? <FieldSkeleton /> : displayOrg}
          </dd>
        </div>

        <div className="flex items-center justify-between gap-4">
          <dt className="shrink-0 text-xs font-medium text-zinc-500">Plan</dt>
          <dd className="text-right text-xs text-zinc-800">
            {isLoading ? <FieldSkeleton /> : displayPlan}
          </dd>
        </div>
      </dl>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-zinc-100 px-5 py-4">
        <RoleGate allow="studio_admin">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
          >
            Admin Panel
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </Link>
          <Link
            href="/admin/tags"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Tag Manager
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </Link>
        </RoleGate>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoggingOut ? (
            <span
              className="h-3 w-3 animate-spin rounded-full border border-zinc-400 border-t-zinc-700"
              aria-hidden
            />
          ) : (
            <LogOut className="h-3 w-3 shrink-0" aria-hidden />
          )}
          {isLoggingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </div>
  );
}
