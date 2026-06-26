"use client";

import {
  PreviewsUploadGrid,
  TemplateContentFields,
  ThumbnailUploadWell,
} from "@/components/studio/TemplateMetaFormFields";
import { TemplateTagSelector } from "@/components/admin/TemplateTagSelector";
import { TierBadge } from "@/lib/tier-config";
import type { TemplateMeta } from "@/lib/template-meta-io";
import {
  Check,
  CheckCircle2,
  Link2,
  Loader2,
  Rocket,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

type Tier = "free" | "premium" | "enterprise";

type PublishedVersion = {
  version: string;
  publishedAt: string;
};

type DialogTab = "settings" | "content" | "preview";

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "premium", label: "Premium" },
  { value: "enterprise", label: "Enterprise" },
];

const TIER_COLORS: Record<Tier, string> = {
  free: "bg-zinc-100 text-zinc-600",
  premium: "bg-amber-50 text-amber-700 border border-amber-200",
  enterprise: "bg-violet-50 text-violet-700 border border-violet-200",
};

const TABS: { id: DialogTab; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "content", label: "Content & Media" },
  { id: "preview", label: "Store Preview" },
];

function StorePreviewCard({
  displayName,
  templateId,
  description,
  thumbnailUrl,
  tier,
}: {
  displayName: string;
  templateId: string;
  description: string;
  thumbnailUrl: string | undefined;
  tier: Tier;
}) {
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="relative h-40 w-full overflow-hidden bg-zinc-100">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-zinc-300">
              <svg
                className="h-10 w-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                />
              </svg>
              <span className="text-xs font-mono">{templateId}</span>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-zinc-900/50 backdrop-blur-[2px]">
          <svg
            className="h-6 w-6 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span className="text-[11px] font-semibold text-white">Not licensed</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight text-zinc-900">
            {displayName}
          </h3>
          <TierBadge tier={tier} className="shrink-0" />
        </div>

        {description.trim() ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500">
            {description}
          </p>
        ) : (
          <p className="text-xs text-zinc-400">No description yet</p>
        )}

        <div className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-center text-xs font-medium text-zinc-600">
          View details →
        </div>
      </div>
    </div>
  );
}

export function PublishTemplateDetailsDialog({
  templateId,
  displayName,
  open,
  onClose,
  selectedTier,
  onTierChange,
  demoUrl,
  onDemoUrlChange,
  isPublishing,
  isDone,
  isDeploying,
  publishedVersion,
  onPublish,
  onDeployDemo,
}: {
  templateId: string;
  displayName: string;
  open: boolean;
  onClose: () => void;
  selectedTier: Tier;
  onTierChange: (tier: Tier) => void;
  demoUrl: string;
  onDemoUrlChange: (url: string) => void;
  isPublishing: boolean;
  isDone: boolean;
  isDeploying: boolean;
  publishedVersion: PublishedVersion | null;
  onPublish: () => void;
  onDeployDemo: () => void;
}) {
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<DialogTab>("settings");

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [description, setDescription] = useState("");
  const [tutorial, setTutorial] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(
    undefined,
  );
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewFilenames, setPreviewFilenames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}/meta`,
      );
      const data = (await res.json()) as {
        ok?: boolean;
        meta?: TemplateMeta;
      };
      if (res.ok && data.ok && data.meta) {
        const m = data.meta;
        setDescription(m.description);
        setTutorial(m.tutorial);
        setIsDirty(false);
        setSaveSuccess(false);
        setThumbnailUrl(
          m.thumbnail
            ? `/api/templates/${encodeURIComponent(templateId)}/meta/asset?file=${encodeURIComponent(m.thumbnail)}`
            : undefined,
        );
        const urls = m.previews.map(
          (f) =>
            `/api/templates/${encodeURIComponent(templateId)}/meta/asset?file=${encodeURIComponent(f)}`,
        );
        setPreviewUrls(urls);
        setPreviewFilenames(m.previews);
      }
    } catch {
      // Non-fatal — meta may not exist yet
    } finally {
      setLoadingMeta(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (open) {
      setSaveError(null);
      setIsDirty(false);
      setActiveTab("settings");
      void loadMeta();
    }
  }, [open, loadMeta]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !isPublishing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving, isPublishing]);

  const handleSaveContent = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}/meta`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description, tutorial }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not save changes.");
      }
      setIsDirty(false);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewRemoved = async (index: number) => {
    const updated = previewFilenames.filter((_, i) => i !== index);
    setPreviewFilenames(updated);
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
    await fetch(`/api/templates/${encodeURIComponent(templateId)}/meta`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previews: updated }),
    });
  };

  if (!open) return null;

  const settingsDisabled = isPublishing || isDeploying;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-zinc-900/25 backdrop-blur-md"
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-[15px] font-semibold text-zinc-900"
            >
              {displayName}
            </h2>
            <p className="truncate font-mono text-xs text-zinc-400">
              {templateId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || isPublishing}
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          className="flex shrink-0 gap-1 border-b border-zinc-100 px-6 pt-3"
          role="tablist"
          aria-label="Publish template sections"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-zinc-900 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "settings" ? (
            <div className="space-y-5">
              <div>
                <label
                  htmlFor={`demo-url-${templateId}`}
                  className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                >
                  <Link2 className="h-3 w-3" aria-hidden />
                  Demo URL
                </label>
                <input
                  id={`demo-url-${templateId}`}
                  type="url"
                  value={demoUrl}
                  onChange={(e) => onDemoUrlChange(e.target.value)}
                  disabled={settingsDisabled}
                  placeholder="https://your-demo.pages.dev"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-700 placeholder-zinc-300 outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 disabled:opacity-50"
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
                  Hosted Cloudflare Pages URL for the playable demo iframe shown
                  in the template storefront.
                </p>

                <button
                  type="button"
                  onClick={onDeployDemo}
                  disabled={isDeploying || isPublishing}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeploying ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Building &amp; Deploying…
                    </>
                  ) : (
                    <>
                      <Rocket className="h-3.5 w-3.5" />
                      Deploy &amp; Link Demo to Cloudflare
                    </>
                  )}
                </button>
              </div>

              <div className="border-t border-zinc-100 pt-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  License tier
                </span>
                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={selectedTier}
                    onChange={(e) => onTierChange(e.target.value as Tier)}
                    disabled={isPublishing}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 outline-none transition-colors focus:border-zinc-400 disabled:opacity-50"
                  >
                    {TIER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${TIER_COLORS[selectedTier]}`}
                  >
                    {selectedTier}
                  </span>
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-5">
                <button
                  type="button"
                  onClick={onPublish}
                  disabled={isPublishing || isDone}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Publishing…
                    </>
                  ) : isDone ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Published
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-4 w-4" />
                      {publishedVersion ? "Re-publish" : "Publish"}
                    </>
                  )}
                </button>
                {publishedVersion ? (
                  <p className="mt-2 text-center text-xs text-green-700">
                    Currently published
                    {publishedVersion.version !== "published"
                      ? ` · v${publishedVersion.version}`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-2 text-center text-xs text-zinc-400">
                    Not yet published to Supabase DRM
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "content" ? (
            loadingMeta ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="space-y-6">
                <TemplateContentFields
                  description={description}
                  tutorial={tutorial}
                  onDescriptionChange={(value) => {
                    setDescription(value);
                    setIsDirty(true);
                    setSaveSuccess(false);
                  }}
                  onTutorialChange={(value) => {
                    setTutorial(value);
                    setIsDirty(true);
                    setSaveSuccess(false);
                  }}
                />

                <div className="border-t border-zinc-100 pt-6">
                  <TemplateTagSelector templateSlug={templateId} />
                </div>

                <div className="border-t border-zinc-100 pt-6">
                  <ThumbnailUploadWell
                    templateId={templateId}
                    currentUrl={thumbnailUrl}
                    onUploaded={(url) => setThumbnailUrl(url)}
                  />
                </div>

                <PreviewsUploadGrid
                  templateId={templateId}
                  previewUrls={previewUrls}
                  onAdded={(url, filename) => {
                    setPreviewUrls((prev) => [...prev, url]);
                    setPreviewFilenames((prev) => [...prev, filename]);
                  }}
                  onRemoved={(i) => void handlePreviewRemoved(i)}
                />
              </div>
            )
          ) : null}

          {activeTab === "preview" ? (
            <div className="space-y-4">
              <p className="text-xs text-zinc-500">
                Preview of how this template appears as a card in the client
                storefront. Updates as you edit Content &amp; Media.
              </p>
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-6">
                <StorePreviewCard
                  displayName={displayName}
                  templateId={templateId}
                  description={description}
                  thumbnailUrl={thumbnailUrl}
                  tier={selectedTier}
                />
              </div>
            </div>
          ) : null}
        </div>

        {saveError ? (
          <p
            className="shrink-0 border-t border-red-100 bg-red-50 px-6 py-2.5 text-xs text-red-600"
            role="alert"
          >
            {saveError}
          </p>
        ) : null}

        {activeTab === "content" ? (
          <footer className="shrink-0 border-t border-zinc-100 bg-zinc-50/50 px-6 py-4">
            <div className="flex items-center justify-end gap-2">
              {saveSuccess && !isDirty ? (
                <span
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600"
                  role="status"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Saved
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => void handleSaveContent()}
                disabled={!isDirty || saving || loadingMeta}
                className="inline-flex min-w-[88px] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save content"
                )}
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export type { Tier, PublishedVersion };
