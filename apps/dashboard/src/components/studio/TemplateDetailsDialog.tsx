"use client";

import {
  PreviewsUploadGrid,
  TemplateContentFields,
  ThumbnailUploadWell,
  templateMetaInputClass as inputClass,
  templateMetaLabelClass as labelClass,
} from "@/components/studio/TemplateMetaFormFields";
import { DeleteTemplateDialog } from "@/components/studio/DeleteTemplateDialog";
import type { TemplateMeta } from "@/lib/template-meta-io";
import {
  Check,
  FolderOpen,
  Loader2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

type Tab = "info" | "content" | "media";

type TemplateDetailsData = {
  templateId: string;
  directoryPath: string;
  version: string;
};

export function TemplateDetailsDialog({
  templateId,
  templateLabel,
  open,
  onClose,
  onDeleted,
}: {
  templateId: string;
  templateLabel: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: (templateId: string) => void;
}) {
  const titleId = useId();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("info");

  const [loadingInfo, setLoadingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [details, setDetails] = useState<TemplateDetailsData | null>(null);
  const [openingFolder, setOpeningFolder] = useState(false);

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

  const loadInfo = useCallback(async () => {
    setLoadingInfo(true);
    setInfoError(null);
    try {
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}`,
      );
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          res.status === 404
            ? "Template API unavailable. Restart pnpm dev to refresh the dev server."
            : `Template API returned an unexpected response (${res.status}).`,
        );
      }
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        templateId?: string;
        directoryPath?: string;
        manifest?: { version?: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not load template details.");
      }
      setDetails({
        templateId: data.templateId ?? templateId,
        directoryPath: data.directoryPath ?? "",
        version: data.manifest?.version ?? "1.0.0",
      });
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : "Load failed.");
    } finally {
      setLoadingInfo(false);
    }
  }, [templateId]);

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
      setActiveTab("info");
      void loadInfo();
      void loadMeta();
    }
  }, [open, loadInfo, loadMeta]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving]);

  const handleSave = async () => {
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

  const handleOpenFolder = async () => {
    setOpeningFolder(true);
    try {
      await fetch(
        `/api/templates/${encodeURIComponent(templateId)}/open-folder`,
        { method: "POST" },
      );
    } catch {
      // best-effort
    } finally {
      setOpeningFolder(false);
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "info", label: "Info" },
    { id: "content", label: "Content" },
    { id: "media", label: "Media" },
  ];

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
        className="relative flex max-h-[min(90vh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2
              id={titleId}
              className="text-[15px] font-semibold text-zinc-900"
            >
              Template details
            </h2>
            <p className="text-xs text-zinc-500">{templateLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          className="flex shrink-0 gap-1 border-b border-zinc-100 px-6 pt-3"
          role="tablist"
          aria-label="Template details sections"
        >
          {tabs.map((tab) => (
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
          {activeTab === "info" ? (
            loadingInfo ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : details ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className={labelClass}>Template ID</span>
                  <p className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 font-mono text-sm text-zinc-600">
                    {details.templateId}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <span className={labelClass}>Version</span>
                  <p className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 text-sm text-zinc-700">
                    v{details.version}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <span className={labelClass}>Location</span>
                  <div className="flex gap-2">
                    <p className="min-w-0 flex-1 break-all rounded-xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-zinc-600">
                      {details.directoryPath}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleOpenFolder()}
                      disabled={openingFolder}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {openingFolder ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5" />
                      )}
                      Open
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-zinc-500">
                {infoError ?? "Template not found."}
              </p>
            )
          ) : null}

          {activeTab === "content" ? (
            loadingMeta ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : (
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
            )
          ) : null}

          {activeTab === "media" ? (
            loadingMeta ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="space-y-6">
                <ThumbnailUploadWell
                  templateId={templateId}
                  currentUrl={thumbnailUrl}
                  onUploaded={(url) => setThumbnailUrl(url)}
                />

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
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="text-xs font-medium text-red-600 transition-colors hover:text-red-800"
            >
              Delete template…
            </button>

            <div className="flex items-center gap-2">
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
                onClick={onClose}
                disabled={saving}
                className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!isDirty || saving || loadingMeta}
                className="inline-flex min-w-[88px] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        </footer>
      </div>

      <DeleteTemplateDialog
        open={deleteOpen}
        templateId={templateId}
        templateLabel={templateLabel}
        onClose={() => setDeleteOpen(false)}
        onDeleted={(deletedId) => {
          setDeleteOpen(false);
          onClose();
          onDeleted?.(deletedId);
        }}
      />
    </div>
  );
}
