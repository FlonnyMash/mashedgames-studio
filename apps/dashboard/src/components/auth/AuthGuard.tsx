"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { Enums } from "@/lib/supabaseClient";
import { isStudioMode } from "@/lib/app-mode";
import { isAuthExemptBrowsePath } from "@/lib/dev-store-access";
import { getProfileViaIpc } from "@/lib/auth-ipc";
import { useAuthStore } from "@/store/useAuthStore";

type UserRole = Enums<"user_role">;

// Role required for this build mode. null = no restriction.
const REQUIRED_ROLE: UserRole | null = isStudioMode() ? "studio_admin" : null;

type GuardStatus = "loading" | "authenticated" | "redirecting";

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <div
      className="flex h-full min-h-dvh items-center justify-center bg-[#fafafa]"
      aria-label="Checking session…"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthGuard
// ---------------------------------------------------------------------------

/**
 * Dual-path session guard:
 *
 * - Electron context: calls `syncAuthStatus()` (IPC) once on mount. Tokens
 *   live exclusively in the main process; the renderer's Supabase client stays
 *   anonymous and is never used for auth here.
 *
 * - Web context:
 *   1. The `onAuthStateChange` subscription is registered FIRST so no auth
 *      event is ever dropped (including TOKEN_REFRESHED that may fire during
 *      the initial profile fetch).
 *   2. `supabase.auth.getSession()` is then called explicitly to resolve the
 *      current session from localStorage without waiting for the asynchronous
 *      INITIAL_SESSION event. INITIAL_SESSION is skipped in the listener
 *      because getSession() already covers it.
 *   3. Protected content is NOT rendered until the session is definitively
 *      resolved — status stays "loading" until getSession() + profile fetch
 *      complete, preventing any component from firing authenticated requests
 *      before the token is confirmed.
 *
 * IMPORTANT — dependency array discipline:
 * The auth-listener effect intentionally does NOT include `pathname` in its
 * deps. Adding `pathname` was the source of the logout zombie-state bug:
 * every client-side navigation caused the effect to re-run, which
 * unsubscribed the active `onAuthStateChange` listener and resubscribed a
 * fresh one. The new subscription immediately fired `INITIAL_SESSION` with
 * the still-valid token, setting status back to "authenticated" and
 * suppressing the redirect.
 * The exempt-path check runs in its own separate effect that watches
 * `pathname` but never touches the Supabase subscription.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<GuardStatus>("loading");
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const syncAuthStatus = useAuthStore((s) => s.syncAuthStatus);

  // Prevents state updates after unmount (e.g. navigating away during async
  // profile fetch) and guards the subscription cleanup closure.
  const mountedRef = useRef(true);

  // ---------------------------------------------------------------------------
  // Exempt-path fast-path: runs on every navigation, but ONLY sets local UI
  // status — never touches the Supabase subscription.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isAuthExemptBrowsePath(pathname)) {
      setStatus("authenticated");
    }
  }, [pathname]);

  // ---------------------------------------------------------------------------
  // Auth init: runs ONCE on mount. Does NOT depend on `pathname` so
  // client-side navigations never unsubscribe / resubscribe the listener.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;

    const isElectron =
      typeof window !== "undefined" &&
      !!(window as Window & { electron?: { ipcRenderer?: unknown } }).electron
        ?.ipcRenderer;

    console.log(`[AuthGuard] initializing in mode: ${isElectron ? "ELECTRON" : "WEB"}`);

    const isExemptPath = isAuthExemptBrowsePath(pathname);

    // ── Electron path ─────────────────────────────────────────────────────────
    // Delegate entirely to the IPC-based syncAuthStatus. The renderer's
    // Supabase client is anonymous; tokens live in the main process only.
    if (isElectron) {
      syncAuthStatus().then(() => {
        if (!mountedRef.current) return;
        const { isAuthenticated, userId, email } = useAuthStore.getState();
        if (isAuthenticated) {
          if (REQUIRED_ROLE) {
            void (async () => {
              const profile = await getProfileViaIpc();
              if (!mountedRef.current) return;

              if (!profile?.ok || profile.profile.role !== REQUIRED_ROLE) {
                clearSession();
                setStatus("redirecting");
                router.replace("/login?error=access_denied");
                return;
              }

              // Keep role available in renderer so RoleGate / profile UI stay consistent.
              setSession({
                isAuthenticated: true,
                email,
                userId,
                role: profile.profile.role as UserRole,
              });
              setStatus("authenticated");
            })();
            return;
          }

          setStatus("authenticated");
        } else if (isExemptPath) {
          clearSession();
          setStatus("authenticated");
        } else {
          setStatus("redirecting");
          router.replace("/login");
        }
      });
      return () => {
        mountedRef.current = false;
      };
    }

    // ── Web path ──────────────────────────────────────────────────────────────
    //
    // Order of operations matters here:
    //
    //   A) Register onAuthStateChange FIRST so no event (e.g. TOKEN_REFRESHED
    //      that fires during the profile fetch) is ever dropped.
    //   B) Then call getSession() to resolve the initial state synchronously
    //      from localStorage without relying on the async INITIAL_SESSION event.
    //
    // INITIAL_SESSION is skipped in the listener because step B handles it.
    // Children are not rendered until step B + profile fetch complete.

    // Shared handler: fetches the user's role, applies role-gating, syncs store.
    const processAuthenticatedSession = async (session: Session) => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mountedRef.current) return;

      if (profileError) {
        console.error("[AuthGuard] Profile fetch error:", JSON.stringify(profileError));
      }

      const role = (profile?.role ?? null) as Enums<"user_role"> | null;

      // Role-gate: sign out users who don't hold the required role for this
      // build mode. The SIGNED_OUT event will fire and hit the listener below.
      if (REQUIRED_ROLE && role !== REQUIRED_ROLE) {
        console.warn(
          `[AuthGuard] Role mismatch — required "${REQUIRED_ROLE}", got "${role ?? "null"}". Signing out.`,
        );
        await supabase.auth.signOut();
        clearSession();
        setStatus("redirecting");
        router.replace("/login?error=access_denied");
        return;
      }

      setSession({
        isAuthenticated: true,
        email: session.user.email ?? null,
        userId: session.user.id,
        role,
      });
      setStatus("authenticated");
    };

    // Step A — subscribe before any async work so TOKEN_REFRESHED / SIGNED_OUT
    // events that fire during the initial getSession() + profile fetch are caught.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return;

      // Skip INITIAL_SESSION — handled by getSession() in step B below.
      if (event === "INITIAL_SESSION") return;

      if (event === "SIGNED_OUT" || !session?.user) {
        clearSession();
        if (isExemptPath) {
          // Dev/store preview can remain browsable without an active session.
          setStatus("authenticated");
        } else {
          setStatus("redirecting");
          router.replace("/login");
        }
        return;
      }

      await processAuthenticatedSession(session);
    });

    // Step B — force session recovery.
    //
    // Attempt 1: getSession() reads from localStorage (fast, no network call
    //   unless the access token is close to expiry and autoRefreshToken fires).
    // Attempt 2: if attempt 1 returns null, call refreshSession() once. This
    //   covers the case where the access token has expired but the refresh token
    //   is still valid and getSession() failed to auto-refresh (e.g. the client
    //   was just cold-started before the refresh timer kicked in).
    // Failure: if both attempts return null, the session is unrecoverable. Wipe
    //   any stale sb-* localStorage keys so the next sign-in starts clean, then
    //   redirect to /login.
    //
    // Children are NOT rendered until this block resolves — status stays
    // "loading" the whole time, preventing premature authenticated requests.
    void (async () => {
      console.log("[AuthGuard] Session recovery attempt triggered");

      // Attempt 1 — read from storage / auto-refresh.
      const { data: { session: storedSession } } = await supabase.auth.getSession();

      if (!mountedRef.current) return;

      console.log(
        `[AuthGuard] Session resolved: ${storedSession?.user ? "SESSION_PRESENT" : "NO_SESSION"}`,
      );

      let currentSession = storedSession;

      if (!currentSession?.user) {
        // Attempt 2 — explicit token refresh (belt-and-suspenders for cold starts).
        console.log("[AuthGuard] No session found — attempting token refresh...");
        const { data: { session: refreshedSession }, error: refreshError } =
          await supabase.auth.refreshSession();

        if (!mountedRef.current) return;

        if (refreshError) {
          console.warn("[AuthGuard] Token refresh failed:", refreshError.message);
        } else if (refreshedSession?.user) {
          console.log("[AuthGuard] Session recovered via token refresh.");
          currentSession = refreshedSession;
        }
      }

      if (!currentSession?.user) {
        // Both attempts failed — session is unrecoverable.
        // Clear stale sb-* entries from localStorage so the next sign-in
        // doesn't pick up a corrupted or mismatched token.
        if (typeof window !== "undefined") {
          const staleKeys = Object.keys(window.localStorage).filter((k) =>
            k.startsWith("sb-"),
          );
          staleKeys.forEach((k) => window.localStorage.removeItem(k));
          if (staleKeys.length > 0) {
            console.log(
              `[AuthGuard] Cleared ${staleKeys.length} stale session key(s) from localStorage.`,
            );
          }
        }
        clearSession();
        if (isExemptPath) {
          // For auth-exempt browse paths, allow rendering without a session.
          setStatus("authenticated");
        } else {
          setStatus("redirecting");
          router.replace("/login");
        }
        return;
      }

      await processAuthenticatedSession(currentSession);
    })();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, setSession, clearSession, syncAuthStatus]);
  // `pathname` is intentionally excluded — see the JSDoc above for rationale.

  // Render nothing protected until the session is definitively confirmed.
  // This prevents any child component from firing authenticated requests
  // before the token is loaded, which would produce a 401.
  if (status === "loading" || status === "redirecting") {
    return <LoadingSpinner />;
  }

  return <>{children}</>;
}
