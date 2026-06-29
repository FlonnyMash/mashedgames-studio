"use client";

import "react-image-crop/dist/ReactCrop.css";

import { MarkdownField } from "@/components/ui/MarkdownField";
import { RichHtmlContent } from "@/components/ui/RichHtmlContent";
import {
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";

export const templateMetaInputClass =
  "w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-4 focus:ring-zinc-900/5";

export const templateMetaLabelClass =
  "text-[11px] font-medium uppercase tracking-wider text-zinc-400";

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

  useEffect(() => {
    const url = URL.createObjectURL(srcFile);
    setImgSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [srcFile]);

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

        {cropError ? (
          <p
            className="shrink-0 border-t border-red-900/40 bg-red-950/40 px-6 py-2 text-xs text-red-400"
            role="alert"
          >
            {cropError}
          </p>
        ) : null}

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

export function ThumbnailUploadWell({
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
        <span className={templateMetaLabelClass}>Thumbnail</span>
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

export function PreviewsUploadGrid({
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
      <span className={templateMetaLabelClass}>Previews</span>
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

export function TemplateContentFields({
  description,
  tutorial,
  onDescriptionChange,
  onTutorialChange,
  disabled = false,
}: {
  description: string;
  tutorial: string;
  onDescriptionChange: (value: string) => void;
  onTutorialChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <MarkdownField
        label="Description"
        hint="Rich text or Markdown — rendered in the Storefront detail view."
        value={description}
        onChange={onDescriptionChange}
        rows={8}
        disabled={disabled}
        placeholder={
          "## Campaign overview\n\nDescribe how this template fits your brand activation…"
        }
        inputClassName={templateMetaInputClass}
        labelClassName={templateMetaLabelClass}
      />

      <label className="block space-y-1.5">
        <span className={templateMetaLabelClass}>Tutorial</span>
        <p className="text-xs text-zinc-500">
          Rich text or Markdown — rendered as help text inside the Configurator.
        </p>
        <textarea
          value={tutorial}
          onChange={(e) => onTutorialChange(e.target.value)}
          rows={10}
          disabled={disabled}
          placeholder={
            "# Getting started\n\nDescribe how to configure this template…"
          }
          className={`${templateMetaInputClass} resize-y font-mono text-xs disabled:opacity-50`}
        />
        {tutorial.trim() ? (
          <div className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              Preview
            </p>
            <RichHtmlContent source={tutorial} variant="light" />
          </div>
        ) : null}
      </label>
    </div>
  );
}
