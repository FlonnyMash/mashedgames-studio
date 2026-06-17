"use client";

import "react-image-crop/dist/ReactCrop.css";

import { DeleteTemplateDialog } from "@/components/studio/DeleteTemplateDialog";
import type { TemplateMeta } from "@/lib/template-meta-io";
import type { TemplateOverview } from "@/lib/template-overview-types";
import {
  Check,
  FolderOpen,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputClass =
  "w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-4 focus:ring-zinc-900/5";

const labelClass =
  "text-[11px] font-medium uppercase tracking-wider text-zinc-400";

type Tab = "info" | "content" | "media";

type TemplateDetailsData = {
  templateId: string;
  directoryPath: string;
  version: string;
};

// ---------------------------------------------------------------------------
// Canvas extraction utility — outputs an optimised JPEG blob
// ---------------------------------------------------------------------------

async function extractCroppedJpeg(
  imgEl: HTMLImageElement,
  pixelCrop: PixelCrop,
  quality = 0.88,
  maxWidth = 1280,
): Promise<Blob> {
  const scaleX = imgEl.naturalWidth / imgEl.width;
  const scaleY = imgEl.naturalHeight / imgEl.height;

  const naturalW = pixelCrop.width * scaleX;
  const naturalH = pixelCrop.height * scaleY;

  // Scale down if the source is wider than maxWidth
  const outScale = naturalW > maxWidth ? maxWidth / naturalW : 1;
  const outW = Math.round(naturalW * outScale);
  const outH = Math.round(naturalH * outScale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  ctx.drawImage(
    imgEl,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    naturalW,
    naturalH,
    0,
    0,
    outW,
    outH,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null."));
      },
      "image/jpeg",
      quality,
    );
  });
}

// ---------------------------------------------------------------------------
// Thumbnail crop modal (z-[60] — on top of details dialog)
// ---------------------------------------------------------------------------

function ThumbnailCropModal({
  srcFile,
  onConfirm,
  onCancel,
}: {
  srcFile: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [imgSrc, setImgSrc] = useState<string>("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(
    undefined,
  );
  const imgRef = useRef<HTMLImageElement>(null);
  const [applying, setApplying] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  // Create a temporary object URL for the selected file
  useEffect(() => {
    const url = URL.createObjectURL(srcFile);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [srcFile]);

  // Initialise a centred 16:9 crop once the image is loaded
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initial = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, 16 / 9, width, height),
      width,
      height,
    );
    setCrop(initial);
  };

  const handleApply = async () => {
    if (!completedCrop || !imgRef.current) {
      setCropError("Adjust the crop area first.");
      return;
    }
    setApplying(true);
    setCropError(null);
    try {
      const blob = await extractCroppedJpeg(imgRef.current, completedCrop);
      onConfirm(blob);
    } catch (err) {
      setCropError(err instanceof Error ? err.message : "Crop failed.");
      setApplying(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="absolute inset-0 bg-zinc-900/70 backdrop-blur-sm"
        aria-hidden
      />

      <div
        role="dialog"
        aria-label="Crop thumbnail — 16:9"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-white">
              Crop thumbnail
            </h3>
            <p className="text-xs text-zinc-400">
              16 : 9 — drag the handles to adjust, then click Apply
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="Cancel crop"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Crop area */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-950 p-4">
          {imgSrc ? (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={16 / 9}
              minWidth={80}
              className="max-h-[60vh]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imgSrc}
                alt="Source for cropping"
                style={{ maxHeight: "60vh", maxWidth: "100%", display: "block" }}
                onLoad={onImageLoad}
              />
            </ReactCrop>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
          )}
        </div>

        {/* Error */}
        {cropError ? (
          <p
            className="shrink-0 border-t border-red-900/40 bg-red-950/40 px-6 py-2 text-xs text-red-400"
            role="alert"
          >
            {cropError}
          </p>
        ) : null}

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-900/60 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={!completedCrop || applying}
            className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-xl bg-white px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Applying…
              </>
            ) : (
              "Apply & Upload"
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail upload well (with cropper step)
// ---------------------------------------------------------------------------

function ThumbnailUploadWell({
  templateId,
  currentUrl,
  onUploaded,
}: {
  templateId: string;
  currentUrl: string | undefined;
  onUploaded: (url: string) => void;
}) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCropConfirm = async (blob: Blob) => {
    setPendingFile(null);
    setUploading(true);
    setError(null);
    try {
      const file = new File([blob], "thumbnail.jpg", { type: "image/jpeg" });
      const form = new FormData();
      form.append("file", file);
      form.append("type", "thumbnail");
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}/meta/upload`,
        { method: "POST", body: form },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        url?: string;
      };
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error ?? "Upload failed.");
      }
      // Cache-bust so the browser immediately renders the replaced thumbnail
      onUploaded(`${data.url}&v=${Date.now()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        <span className={labelClass}>Thumbnail</span>
        <div
          className="group relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 transition-colors hover:border-zinc-300 hover:bg-zinc-100"
          onClick={() => !uploading && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !uploading)
              inputRef.current?.click();
          }}
          aria-label="Upload thumbnail"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-xs">Uploading…</span>
            </div>
          ) : currentUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt="Thumbnail preview"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              {/* Replace overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/0 transition-colors group-hover:bg-zinc-900/50">
                <span className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-zinc-800 opacity-0 transition-opacity group-hover:opacity-100">
                  Replace
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-zinc-400">
              <ImageIcon className="h-10 w-10" />
              <span className="text-xs font-medium">
                Click to upload thumbnail
              </span>
              <span className="text-[11px] text-zinc-300">
                PNG · JPG · WEBP · GIF
              </span>
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPendingFile(file);
            e.target.value = "";
          }}
        />
        {error ? (
          <p className="text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {/* Crop modal — rendered outside the main dialog scroll area */}
      {pendingFile ? (
        <ThumbnailCropModal
          srcFile={pendingFile}
          onConfirm={(blob) => void handleCropConfirm(blob)}
          onCancel={() => setPendingFile(null)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Previews upload grid
// ---------------------------------------------------------------------------

function PreviewsUploadGrid({
  templateId,
  previewUrls,
  onAdded,
  onRemoved,
}: {
  templateId: string;
  previewUrls: string[];
  onAdded: (url: string, filename: string) => void;
  onRemoved: (index: number) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("type", "preview");
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}/meta/upload`,
        { method: "POST", body: form },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        url?: string;
        filename?: string;
      };
      if (!res.ok || !data.ok || !data.url || !data.filename) {
        throw new Error(data.error ?? "Upload failed.");
      }
      onAdded(data.url, data.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <span className={labelClass}>Previews</span>
      <p className="text-xs text-zinc-500">
        Upload images or short videos (gif, mp4, webm) shown in the Storefront.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {previewUrls.map((url, i) => (
          <div
            key={url}
            className="group relative aspect-video overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
          >
            {url.includes(".mp4") || url.includes(".webm") ? (
              <video
                src={url}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={`Preview ${i + 1}`}
                className="h-full w-full object-cover"
              />
            )}
            <button
              type="button"
              onClick={() => onRemoved(i)}
              className="absolute right-1 top-1 rounded-full bg-zinc-900/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove preview"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-video items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 transition-colors hover:border-zinc-300 hover:bg-zinc-100 disabled:opacity-50"
          aria-label="Add preview"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Plus className="h-5 w-5" />
          )}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

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

  // Info state
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [details, setDetails] = useState<TemplateDetailsData | null>(null);
  const [openingFolder, setOpeningFolder] = useState(false);

  // Meta (content + media) state
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
  // Tracks whether description/tutorial have unsaved changes
  const [isDirty, setIsDirty] = useState(false);

  const loadInfo = useCallback(async () => {
    setLoadingInfo(true);
    setInfoError(null);
    try {
      const res = await fetch(
        `/api/templates/${encodeURIComponent(templateId)}`,
      );
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
        {/* Header */}
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

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 border-b border-zinc-100 px-6 pt-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
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

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* ── Info tab ── */}
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

          {/* ── Content tab ── */}
          {activeTab === "content" ? (
            loadingMeta ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="space-y-5">
                <label className="block space-y-1.5">
                  <span className={labelClass}>Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setIsDirty(true);
                      setSaveSuccess(false);
                    }}
                    rows={3}
                    placeholder="Short description shown in the Storefront…"
                    className={`${inputClass} resize-y`}
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className={labelClass}>Tutorial (Markdown)</span>
                  <p className="text-xs text-zinc-500">
                    Rendered as help text inside the Configurator.
                  </p>
                  <textarea
                    value={tutorial}
                    onChange={(e) => {
                      setTutorial(e.target.value);
                      setIsDirty(true);
                      setSaveSuccess(false);
                    }}
                    rows={10}
                    placeholder={
                      "# Getting started\n\nDescribe how to configure this template…"
                    }
                    className={`${inputClass} resize-y font-mono text-xs`}
                  />
                </label>
              </div>
            )
          ) : null}

          {/* ── Media tab ── */}
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

        {/* Error banner */}
        {saveError ? (
          <p
            className="shrink-0 border-t border-red-100 bg-red-50 px-6 py-2.5 text-xs text-red-600"
            role="alert"
          >
            {saveError}
          </p>
        ) : null}

        {/* Footer — always visible across all tabs */}
        <footer className="shrink-0 border-t border-zinc-100 bg-zinc-50/50 px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            {/* Left: destructive action */}
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="text-xs font-medium text-red-600 transition-colors hover:text-red-800"
            >
              Delete template…
            </button>

            {/* Right: save feedback + actions */}
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
