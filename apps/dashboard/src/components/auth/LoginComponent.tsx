"use client";

import { useLayoutEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { BRAND_LOGO_INTRINSIC_SIZE } from "@/lib/brand-logo-constants";
import { isStudioMode } from "@/lib/app-mode";
import { notifyDesktopUiReady } from "@/lib/desktop-boot";
import { usePlatformStore } from "@/store/usePlatformStore";
import { useAuthStore } from "@/store/useAuthStore";

// ---------------------------------------------------------------------------
// Config per build mode
// ---------------------------------------------------------------------------

const MODE_CONFIG = isStudioMode()
  ? {
      heading: "Sign in to Studio",
      subheading: "Mashed Games internal access",
      emailPlaceholder: "you@mashedgames.com",
      footer: "Access is restricted to Mashed Games team members.",
      accessDeniedError:
        "This account does not have Studio access. Contact your admin.",
    }
  : {
      heading: "Sign in",
      subheading: "Enter your credentials to access the Configurator",
      emailPlaceholder: "you@example.com",
      footer: "Contact your Mashed Games account manager if you need access.",
      accessDeniedError:
        "Access denied. Contact your Mashed Games account manager.",
    };

const POST_LOGIN_REDIRECT = "/";

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function resolveErrorMessage(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("legacy api keys are disabled")) {
    return (
      "Supabase legacy API keys are disabled. Update NEXT_PUBLIC_SUPABASE_ANON_KEY " +
      "to your sb_publishable_ key and SUPABASE_SERVICE_ROLE_KEY to sb_secret_ in .env.local, " +
      "then restart the dev server."
    );
  }
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please verify your email address before signing in.";
  }
  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "Too many sign-in attempts. Please wait a moment and try again.";
  }
  if (msg.includes("user not found")) {
    return "No account found for this email address.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Connection error. Check your internet connection and try again.";
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoginComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appName = usePlatformStore((s) => s.appName);
  const logoPath = usePlatformStore((s) => s.logoPath);
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AuthGuard redirects here with ?error=access_denied when the session role
  // doesn't match the current build mode.
  const urlError =
    searchParams.get("error") === "access_denied"
      ? MODE_CONFIG.accessDeniedError
      : null;
  const [formError, setFormError] = useState<string | null>(null);
  const error = formError ?? urlError;

  useLayoutEffect(() => {
    notifyDesktopUiReady();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFormError("Email and password are required.");
      return;
    }

    setIsSubmitting(true);

    // In Electron, authentication must go through IPC so the main process holds
    // session tokens in safeStorage. The renderer's Supabase client is anon-only
    // and AuthGuard's Electron path never checks onAuthStateChange — only IPC.
    const isElectron =
      typeof window !== "undefined" &&
      !!(window as Window & { electron?: { ipcRenderer?: unknown } }).electron
        ?.ipcRenderer;

    if (isElectron) {
      const errorMsg = await login(trimmedEmail, password);
      setIsSubmitting(false);
      if (errorMsg) {
        setFormError(resolveErrorMessage(errorMsg));
        return;
      }
      router.replace(POST_LOGIN_REDIRECT);
      return;
    }

    // Web context: use Supabase client directly. AuthGuard picks up the session
    // via onAuthStateChange and applies role-gating before granting access.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      setFormError(resolveErrorMessage(signInError.message));
      setIsSubmitting(false);
      return;
    }

    router.replace(POST_LOGIN_REDIRECT);
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            src={logoPath}
            alt={appName}
            width={BRAND_LOGO_INTRINSIC_SIZE.width}
            height={BRAND_LOGO_INTRINSIC_SIZE.height}
            unoptimized
            priority
            className="block h-[81px] w-auto max-w-[235px] shrink-0 object-contain"
          />
          <span className="text-2xl font-semibold tracking-tight text-zinc-900">
            {appName}
          </span>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-center text-lg font-semibold text-zinc-900">
            {MODE_CONFIG.heading}
          </h1>
          <p className="mb-6 text-center text-sm text-zinc-500">
            {MODE_CONFIG.subheading}
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-medium text-zinc-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                placeholder={MODE_CONFIG.emailPlaceholder}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium text-zinc-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                placeholder="••••••••"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Error banner */}
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                {error}
              </div>
            ) : null}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden
                  />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400">
          {MODE_CONFIG.footer}
        </p>
      </div>
    </div>
  );
}
