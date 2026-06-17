"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

export type ImageFieldInputProps = {
  label: string;
  value?: string;
  previewSrc?: string | null;
  disabled?: boolean;
  onFileSelect: (file: File) => void | Promise<void>;
  onClear?: () => void;
};

export function ImageFieldInput({
  label,
  value,
  previewSrc,
  disabled = false,
  onFileSelect,
  onClear,
}: ImageFieldInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      await onFileSelect(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-zinc-700">{label}</span>
      <div
        className={[
          "overflow-hidden rounded-xl border-2 border-dashed bg-white transition-colors",
          disabled
            ? "cursor-not-allowed opacity-40"
            : "border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/20",
        ].join(" ")}
      >
        {previewSrc ? (
          <div className="flex items-center gap-3 p-3">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
              <img
                src={previewSrc}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-zinc-800">Custom sprite</p>
              {value ? (
                <p className="truncate text-[11px] text-zinc-500">{value}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
              <ImagePlus className="h-5 w-5" aria-hidden />
            </div>
            <p className="text-xs text-zinc-500">PNG or WebP · up to 4 MB</p>
          </div>
        )}

        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 border-t border-zinc-100 bg-zinc-50 px-3 py-2.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Uploading…
            </>
          ) : previewSrc ? (
            "Replace image"
          ) : (
            "Choose image"
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg,image/svg+xml"
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
            event.target.value = "";
          }}
        />
      </div>

      {previewSrc && onClear ? (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={onClear}
          className="text-[11px] font-medium text-zinc-500 transition hover:text-red-600 disabled:opacity-40"
        >
          Remove custom sprite
        </button>
      ) : null}
    </div>
  );
}
