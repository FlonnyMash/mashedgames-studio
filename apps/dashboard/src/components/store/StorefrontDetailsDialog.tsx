"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Gamepad2, Lock, Loader2, Package, X, Zap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { acquireLicenseViaIpc } from "@/lib/store-ipc";
import { useLicenseStore } from "@/store/useLicenseStore";
import { useAuthStore } from "@/store/useAuthStore";
import {
  parseManifest,
  slugToTitle,
  TIER_BADGE,
  type EnrichedTemplate,
} from "./storefront-types";

// ---------------------------------------------------------------------------
// Feature pill config
// ---------------------------------------------------------------------------

const UI_MODULE_LABELS: Record<string, string> = {
  highscore: "Highscore",
  "lead-capture": "Lead Capture",
  "countdown-timer": "Countdown Timer",
  "lives-display": "Lives Display",
  "combo-multiplier": "Combo Multiplier",
  "percentage-win": "Win %",
};

const PRO_FEATURE_MODULES = ["lead-capture", "highscore", "combo-multiplier"];

function isElectronRuntime() {
  return (
    typeof window !== "undefined" &&
    !!(window as Window & { electron?: { ipcRenderer?: unknown } }).electron
      ?.ipcRenderer
  );
}

async function resolveAccessToken(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.access_token) {
    return sessionData.session.access_token;
  }

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed?.session?.access_token ?? null;
}

async function resolveOrganizationId(
  organizationId: string | null,
): Promise<string | null> {
  if (organizationId) return organizationId;

  const userId = useAuthStore.getState().userId;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();

  return profile?.organization_id ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPublishedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

type LoadTier = "fast" | "moderate" | "slow";

function getLoadTier(seconds: number): LoadTier {
  if (seconds <= 0.2) return "fast";
  if (seconds <= 0.7) return "moderate";
  return "slow";
}

const LOAD_TIER_BADGE: Record<LoadTier, string> = {
  fast: "border-emerald-200 bg-emerald-50 text-emerald-700",
  moderate: "border-amber-200 bg-amber-50 text-amber-700",
  slow: "border-red-200 bg-red-50 text-red-700",
};

const LOAD_TIER_LABEL: Record<LoadTier, string> = {
  fast: "Excellent",
  moderate: "Acceptable",
  slow: "Slow",
};

const LOAD_TIER_DOT: Record<LoadTier, string> = {
  fast: "bg-emerald-500",
  moderate: "bg-amber-500",
  slow: "bg-red-500",
};

function DemoPerformanceBadge({
  loadTimeMs,
  demoSizeKb,
}: {
  loadTimeMs: number | null;
  demoSizeKb?: number;
}) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const loadSeconds = loadTimeMs !== null ? loadTimeMs / 1000 : null;
  const tier =
    loadSeconds !== null ? getLoadTier(loadSeconds) : null;
  const badgeCls =
    tier !== null ? LOAD_TIER_BADGE[tier] : "border-zinc-200 bg-zinc-50 text-zinc-600";

  const cancelHide = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => setShowInfo(false), 120);
  };

  const openInfo = () => {
    cancelHide();
    const el = badgeRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setTooltipPos({
        top: rect.bottom + 8,
        left: Math.max(12, rect.right - 288),
      });
    }
    setShowInfo(true);
  };

  return (
    <div className="relative">
      <span
        ref={badgeRef}
        tabIndex={0}
        onMouseEnter={openInfo}
        onMouseLeave={scheduleHide}
        onFocus={openInfo}
        onBlur={scheduleHide}
        className={`inline-flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors ${badgeCls}`}
        aria-describedby={showInfo ? "demo-perf-info" : undefined}
      >
        <Zap className="h-3 w-3 shrink-0" aria-hidden />
        Load Time:{" "}
        {loadTimeMs === null ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            <span className="sr-only">Measuring load time</span>
          </>
        ) : (
          `${loadSeconds!.toFixed(2)}s`
        )}
      </span>

      {showInfo ? (
        <div
          id="demo-perf-info"
          role="tooltip"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          className="fixed z-[100] w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg ring-1 ring-zinc-950/5"
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Demo performance
          </p>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-500">Load time</span>
              <span className="font-semibold text-zinc-900">
                {loadTimeMs === null ? (
                  <span className="inline-flex items-center gap-1.5 text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Measuring…
                  </span>
                ) : (
                  <>
                    {loadSeconds!.toFixed(2)}s
                    {tier ? (
                      <span className="ml-1.5 text-xs font-medium text-zinc-500">
                        ({LOAD_TIER_LABEL[tier]})
                      </span>
                    ) : null}
                  </>
                )}
              </span>
            </div>

            {typeof demoSizeKb === "number" ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Bundle size
                </span>
                <span className="font-semibold text-zinc-900">
                  {(demoSizeKb / 1024).toFixed(2)} MB
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-4 border-t border-zinc-100 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Load time scale
            </p>
            <ul className="mt-2 space-y-1.5">
              {(
                [
                  ["fast", "≤ 0.20s", "Excellent — near-instant"],
                  ["moderate", "0.21 – 0.70s", "Acceptable"],
                  ["slow", "> 0.70s", "Needs optimization"],
                ] as const
              ).map(([key, range, label]) => (
                <li key={key} className="flex items-center gap-2 text-xs text-zinc-600">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${LOAD_TIER_DOT[key]}`}
                    aria-hidden
                  />
                  <span className="font-medium text-zinc-700">{range}</span>
                  <span className="text-zinc-400">— {label}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
            Load time was measured live in your browser just now. Bundle size reflects
            the last deployed demo build.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeaturePill
// ---------------------------------------------------------------------------

function FeaturePill({
  module,
  isLicensed,
}: {
  module: string;
  isLicensed: boolean;
}) {
  const label = UI_MODULE_LABELS[module] ?? module;
  const showLock = PRO_FEATURE_MODULES.includes(module) && !isLicensed;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm">
      {showLock ? (
        <Lock className="h-3 w-3 shrink-0 text-zinc-400" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AcquireCTA
// ---------------------------------------------------------------------------

type CtaState =
  | "owned"
  | "free-acquire"
  | "premium-lock"
  | "cap-reached"
  | "pending"
  | "error";

function AcquireCTA({
  template,
  atLicenseCap,
}: {
  template: EnrichedTemplate;
  atLicenseCap: boolean;
}) {
  const [ctaState, setCtaState] = useState<CtaState>(() => {
    if (template.isLicensed) return "owned";
    if (atLicenseCap) return "cap-reached";
    if (template.tier === "free") return "free-acquire";
    return "premium-lock";
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const addLicense = useLicenseStore((s) => s.addLicense);
  const organizationId = useLicenseStore((s) => s.organizationId);

  const resolvedOwned = template.isLicensed || ctaState === "owned";

  if (resolvedOwned) {
    return (
      <button
        type="button"
        className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
      >
        Open in Engine
      </button>
    );
  }

  if (ctaState === "cap-reached") {
    return (
      <div
        aria-disabled="true"
        className="w-full cursor-not-allowed rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-center text-sm font-medium text-zinc-400 select-none"
        title="Your plan's template limit has been reached. Contact your account manager to expand your entitlement."
      >
        License cap reached
      </div>
    );
  }

  if (ctaState === "premium-lock") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          aria-disabled="true"
          className="w-full cursor-not-allowed rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-700 select-none"
          title="Premium and Enterprise templates require license provisioning by your account manager."
        >
          Upgrade Required
        </div>
        <p className="text-xs text-zinc-400">
          Contact your account manager to license this template.
        </p>
      </div>
    );
  }

  if (ctaState === "pending") {
    return (
      <button
        type="button"
        disabled
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Adding to library…
      </button>
    );
  }

  if (ctaState === "error") {
    return (
      <div className="space-y-2">
        {errorMsg ? (
          <p className="text-center text-xs text-red-600" role="alert">
            {errorMsg}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            setCtaState("free-acquire");
          }}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          Try again
        </button>
      </div>
    );
  }

  const handleAcquire = async () => {
    setCtaState("pending");
    setErrorMsg(null);

    try {
      if (isElectronRuntime()) {
        const data = await acquireLicenseViaIpc(template.id);
        if (!data) {
          throw new Error(
            "Desktop auth bridge is out of date. Restart the app and try again.",
          );
        }
        if (!data.ok) {
          const message =
            data.error === "SESSION_EXPIRED"
              ? "Session expired. Please sign in again."
              : data.error;
          throw new Error(message);
        }

        addLicense(template.id);
        setCtaState("owned");
        return;
      }

      const jwt = await resolveAccessToken();
      if (!jwt) {
        setErrorMsg("Session expired. Please sign in again.");
        setCtaState("error");
        return;
      }

      const resolvedOrgId = await resolveOrganizationId(organizationId);
      if (!resolvedOrgId) {
        setErrorMsg(
          "Could not determine your organization. Please reload and try again.",
        );
        setCtaState("error");
        return;
      }

      const res = await fetch("/api/acquire-license", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          template_id: template.id,
          org_id: resolvedOrgId,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        licenseId?: string;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Acquisition failed.");
      }

      addLicense(template.id);
      setCtaState("owned");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Acquisition failed.");
      setCtaState("error");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleAcquire()}
      className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
    >
      Add to Library — Free
    </button>
  );
}

// ---------------------------------------------------------------------------
// Device mockup — shared portrait frame for demo iframe & screenshot fallback
// ---------------------------------------------------------------------------

const DEVICE_MOCKUP_CLASSES =
  "relative h-[65vh] md:h-[70vh] 2xl:h-[75vh] max-h-[850px] aspect-[9/16] w-auto mx-auto bg-black rounded-[2.5rem] overflow-hidden shadow-2xl ring-8 ring-slate-800 shrink-0 flex-none";

function DeviceMockupFrame({ children }: { children: ReactNode }) {
  return <div className={DEVICE_MOCKUP_CLASSES}>{children}</div>;
}

function collectFallbackImages(template: EnrichedTemplate): string[] {
  const previews = Array.isArray(template.preview_urls)
    ? template.preview_urls.filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0,
      )
    : [];

  if (previews.length > 0) return previews;
  if (typeof template.thumbnail_url === "string" && template.thumbnail_url.trim()) {
    return [template.thumbnail_url];
  }
  return [];
}

// ---------------------------------------------------------------------------
// StorefrontDetailsDialog
// ---------------------------------------------------------------------------

export function StorefrontDetailsDialog({
  template,
  atLicenseCap,
  onClose,
}: {
  template: EnrichedTemplate;
  atLicenseCap: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const manifest = parseManifest(template.manifest);
  const [loadStartTime] = useState(() => Date.now());
  const [loadTimeMs, setLoadTimeMs] = useState<number | null>(null);

  const displayName = manifest.displayName ?? slugToTitle(template.template_slug);
  const tierInfo = TIER_BADGE[template.tier] ?? TIER_BADGE.premium;
  const featureModules: string[] = Array.isArray(manifest.supportsUI)
    ? manifest.supportsUI
    : [];
  const demoUrl = manifest.demo_url ?? null;
  const fallbackImages = collectFallbackImages(template);

  const hasContent = demoUrl || template.description || featureModules.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-950/65 backdrop-blur-md"
        aria-hidden
      />

      {/* Dialog panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-zinc-200/50 bg-white shadow-[0_48px_140px_-24px_rgba(0,0,0,0.55)]"
        style={{ width: "min(90vw, 72rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — top-right of the panel */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-zinc-100 p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Left column: Media ── */}
        <div className="col-span-12 md:col-span-8 flex min-w-0 flex-1 items-center justify-center w-full min-h-[500px] overflow-y-auto rounded-2xl bg-slate-50/50">
          {demoUrl ? (
            <div className="flex flex-col items-center px-4 py-6">
              <DeviceMockupFrame>
                <iframe
                  src={demoUrl}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  title={`${displayName} live demo`}
                  loading="lazy"
                  onLoad={() => setLoadTimeMs(Date.now() - loadStartTime)}
                  className="absolute inset-0 h-full w-full border-0"
                />
              </DeviceMockupFrame>
              <p className="mt-6 text-center text-xs tracking-wide text-zinc-400">
                Interactive demo — scroll or tap to play
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center px-4 py-6">
              <DeviceMockupFrame>
                {fallbackImages.length > 0 ? (
                  <div className="absolute inset-0 grid grid-cols-2 gap-0.5 overflow-y-auto bg-zinc-950 p-0.5">
                    {fallbackImages.map((url, index) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${url}-${index}`}
                        src={url}
                        alt={`${displayName} preview ${index + 1}`}
                        className="aspect-[9/16] w-full object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900 px-6 text-center">
                    <Gamepad2 className="h-10 w-10 text-zinc-600" aria-hidden />
                    <p className="text-sm text-zinc-500">No playable demo available</p>
                    <span className="font-mono text-xs text-zinc-600">
                      {template.template_slug}
                    </span>
                  </div>
                )}
              </DeviceMockupFrame>
              {fallbackImages.length > 0 ? (
                <p className="mt-6 text-center text-xs tracking-wide text-zinc-400">
                  Preview screenshots
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Right column: Meta + sticky CTA (fixed width) ── */}
        <div className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-zinc-100 bg-white">

          {/* Scrollable meta content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-14">

            {/* Logo + title */}
            <div className="flex items-start gap-3">
              {manifest.logoUrl ? (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50 p-1.5 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={manifest.logoUrl}
                    alt={`${displayName} logo`}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : null}
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="text-base font-bold leading-snug text-zinc-900"
                >
                  {displayName}
                </h2>
                {template.published_at ? (
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Updated {formatPublishedAt(template.published_at)}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Status + tier badges */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {template.isLicensed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  In Library
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500">
                  <Lock className="h-3 w-3" aria-hidden />
                  Not owned
                </span>
              )}
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tierInfo.cls}`}
              >
                {tierInfo.label}
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-xs font-medium text-zinc-400">
                v{template.version}
              </span>
            </div>

            {/* Performance stats */}
            {demoUrl ? (
              <div className="mt-3">
                <DemoPerformanceBadge
                  loadTimeMs={loadTimeMs}
                  demoSizeKb={
                    typeof manifest.demo_size_kb === "number"
                      ? manifest.demo_size_kb
                      : undefined
                  }
                />
              </div>
            ) : null}

            {/* Features */}
            {featureModules.length > 0 ? (
              <div className="mt-7">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  Features
                </h3>
                <div className="flex flex-wrap gap-2">
                  {featureModules.map((mod) => (
                    <FeaturePill
                      key={mod}
                      module={mod}
                      isLicensed={template.isLicensed}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Description */}
            {template.description ? (
              <div className="mt-7">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  About
                </h3>
                <p className="text-sm leading-relaxed text-zinc-600">
                  {template.description}
                </p>
              </div>
            ) : null}

            {/* Empty content state */}
            {!hasContent ? (
              <div className="mt-6 rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center">
                <p className="text-xs text-zinc-400">
                  No additional details available.
                </p>
              </div>
            ) : null}
          </div>

          {/* Sticky CTA footer */}
          <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/60 px-6 py-5">
            <AcquireCTA template={template} atLicenseCap={atLicenseCap} />
          </div>
        </div>
      </div>
    </div>
  );
}
