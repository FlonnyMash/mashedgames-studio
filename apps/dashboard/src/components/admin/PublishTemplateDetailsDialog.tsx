"use client";

import {
  PreviewsUploadGrid,
  TemplateContentFields,
  ThumbnailUploadWell,
} from "@/components/studio/TemplateMetaFormFields";
import { TemplateTagSelector } from "@/components/admin/TemplateTagSelector";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  getBadgeStyle,
  type BadgeType,
} from "@/lib/badge-config";
import type { TemplateMeta } from "@/lib/template-meta-io";
import { BADGE_TYPES } from "@mashedgames/shared";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Rocket,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import {
  buildStorefrontEditorHref,
  buildStorefrontPreviewHref,
  type AdminTemplateTab,
} from "@/lib/storefront-editor-routes";

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

const TABS: { id: DialogTab; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "content", label: "Content & Media" },
  { id: "preview", label: "Store Preview" },
];

export function PublishTemplateDetailsDialog({
  templateId,
  displayName,
  open,
  onClose,
  initialTab = "settings",
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
  initialTab?: AdminTemplateTab;
}) {
  const titleId = useId();
  const [activeTab, setActiveTab] = useState<DialogTab>(initialTab);

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [title, setTitle] = useState(displayName);
  const [description, setDescription] = useState("");
  const [tutorial, setTutorial] = useState("");
  const [badgeType, setBadgeType] = useState<BadgeType | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagsDirty, setTagsDirty] = useState(false);
  const [cloudThumbnailUrl, setCloudThumbnailUrl] = useState("");
  const [cloudPreviewUrls, setCloudPreviewUrls] = useState<string[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(
    undefined,
  );
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewFilenames, setPreviewFilenames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = () => {
    setIsDirty(true);
    setSaveSuccess(false);
  };

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [localRes, cloudJson] = await Promise.all([
        fetch(`/api/templates/${encodeURIComponent(templateId)}/meta`),
        adminApiFetch<{
          ok: true;
          title: string;
          description: string;
          badgeType: BadgeType | null;
          tutorial: string;
          thumbnailUrl: string;
          previewUrls: string[];
          tagIds: string[];
        }>(`/api/templates/${encodeURIComponent(templateId)}/metadata`).catch(
          () => null,
        ),
      ]);

      const data = (await localRes.json()) as {
        ok?: boolean;
        meta?: TemplateMeta;
      };

      if (localRes.ok && data.ok && data.meta) {
        const m = data.meta;
        setDescription(m.description);
        setTutorial(m.tutorial);
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

      if (cloudJson?.ok) {
        if (cloudJson.title.trim()) setTitle(cloudJson.title);
        else setTitle(displayName);
        if (cloudJson.description.trim()) setDescription(cloudJson.description);
        if (cloudJson.tutorial.trim()) setTutorial(cloudJson.tutorial);
        setBadgeType(cloudJson.badgeType);
        setCloudThumbnailUrl(cloudJson.thumbnailUrl);
        setCloudPreviewUrls(cloudJson.previewUrls);
        setSelectedTagIds(cloudJson.tagIds);
      } else {
        setTitle(displayName);
      }

      setIsDirty(false);
      setTagsDirty(false);
      setSaveSuccess(false);
    } catch {
      setTitle(displayName);
    } finally {
      setLoadingMeta(false);
    }
  }, [displayName, templateId]);

  useEffect(() => {
    if (open) {
      setSaveError(null);
      setIsDirty(false);
      setActiveTab(initialTab);
      void loadMeta();
    }
  }, [open, loadMeta, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !isPublishing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving, isPublishing]);

  const handleSaveChanges = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await adminApiFetch<{
        ok: true;
        thumbnailUrl: string;
        previewUrls: string[];
      }>(`/api/templates/${encodeURIComponent(templateId)}/metadata`, {
        method: "PUT",
        body: {
          title,
          description,
          badgeType,
          tutorial,
          thumbnailUrl: cloudThumbnailUrl,
          previewUrls: cloudPreviewUrls,
          tagIds: selectedTagIds,
        },
      });

      if (!result.ok) {
        throw new Error(result.error ?? "Could not save changes.");
      }

      setCloudThumbnailUrl(result.thumbnailUrl);
      setCloudPreviewUrls(result.previewUrls);
      setIsDirty(false);
      setTagsDirty(false);
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
    markDirty();
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
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Badge type
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBadgeType(null);
                      markDirty();
                    }}
                    disabled={settingsDisabled}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                      badgeType === null
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                    }`}
                  >
                    None
                  </button>
                  {BADGE_TYPES.map((type) => {
                    const badgeStyle = getBadgeStyle(type);
                    return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setBadgeType(type);
                        markDirty();
                      }}
                      disabled={settingsDisabled}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                        badgeType === type
                          ? `${badgeStyle?.ribbonClass ?? ""} border-transparent`
                          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                      }`}
                    >
                      {badgeStyle?.label ?? type}
                    </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                  Storefront ribbon shown on template cards. Saved with metadata
                  — no republish required.
                </p>
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
                <div>
                  <label
                    htmlFor={`title-${templateId}`}
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                  >
                    Storefront title
                  </label>
                  <input
                    id={`title-${templateId}`}
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      markDirty();
                    }}
                    maxLength={200}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition-colors focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
                  />
                </div>

                <TemplateContentFields
                  description={description}
                  tutorial={tutorial}
                  onDescriptionChange={(value) => {
                    setDescription(value);
                    markDirty();
                  }}
                  onTutorialChange={(value) => {
                    setTutorial(value);
                    markDirty();
                  }}
                />

                <div className="border-t border-zinc-100 pt-6">
                  <TemplateTagSelector
                    templateSlug={templateId}
                    mode="unified"
                    onDirtyChange={setTagsDirty}
                    onSelectionChange={setSelectedTagIds}
                  />
                </div>

                <div className="border-t border-zinc-100 pt-6">
                  <ThumbnailUploadWell
                    templateId={templateId}
                    currentUrl={thumbnailUrl}
                    onUploaded={(url) => {
                      setThumbnailUrl(url);
                      markDirty();
                    }}
                  />
                </div>

                <PreviewsUploadGrid
                  templateId={templateId}
                  previewUrls={previewUrls}
                  onAdded={(url, filename) => {
                    setPreviewUrls((prev) => [...prev, url]);
                    setPreviewFilenames((prev) => [...prev, filename]);
                    markDirty();
                  }}
                  onRemoved={(i) => void handlePreviewRemoved(i)}
                />
              </div>
            )
          ) : null}

          {activeTab === "preview" ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-5">
                <p className="text-sm font-medium text-zinc-900">
                  Live Storefront Editor
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Edit the real storefront detail page — what you change here is
                  exactly what clients will see after publish.
                </p>
                <Link
                  href={buildStorefrontEditorHref(templateId, { fromAdmin: true })}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Edit live in store
                </Link>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Live preview
                </p>
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 shadow-inner">
                  <iframe
                    title={`Storefront preview for ${templateId}`}
                    src={buildStorefrontPreviewHref(templateId, { fromAdmin: true })}
                    className="h-[min(70vh,720px)] w-full border-0"
                    loading="lazy"
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Read-only embed of the storefront detail page. Use the button
                  above to open the visual editor.
                </p>
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

        <footer className="shrink-0 border-t border-zinc-100 bg-zinc-50/50 px-6 py-4">
          <div className="flex items-center justify-end gap-2">
            {saveSuccess && !isDirty && !tagsDirty ? (
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
              onClick={() => void handleSaveChanges()}
              disabled={(!isDirty && !tagsDirty) || saving || loadingMeta}
              className="inline-flex min-w-[88px] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export type { Tier, PublishedVersion };
