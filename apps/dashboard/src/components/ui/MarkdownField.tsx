"use client";

import { useId, useState } from "react";
import { RichHtmlContent } from "./RichHtmlContent";
import { cn } from "@/lib/utils";

type MarkdownFieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  inputClassName?: string;
  labelClassName?: string;
};

export function MarkdownField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 8,
  disabled = false,
  inputClassName,
  labelClassName,
}: MarkdownFieldProps) {
  const baseId = useId();
  const [mode, setMode] = useState<"split" | "write" | "preview">("split");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <span className={labelClassName}>{label}</span>
          {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
        </div>

        <div
          className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 lg:hidden"
          role="tablist"
          aria-label={`${label} view mode`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode !== "preview"}
            onClick={() => setMode("write")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode !== "preview"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => setMode("preview")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === "preview"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            Preview
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <label
          htmlFor={baseId}
          className={cn("block space-y-1.5", mode === "preview" && "hidden lg:block")}
        >
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 lg:sr-only">
            Markdown source
          </span>
          <textarea
            id={baseId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            disabled={disabled}
            placeholder={placeholder}
            spellCheck={false}
            className={cn(
              "w-full resize-y font-mono text-xs disabled:opacity-50",
              inputClassName,
            )}
          />
        </label>

        <div
          className={cn(
            "min-h-[12rem] rounded-xl border border-zinc-200/80 bg-white px-4 py-3",
            mode === "write" && "hidden lg:block",
          )}
        >
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Preview
          </p>
          {value.trim() ? (
            <RichHtmlContent source={value} variant="light" />
          ) : (
            <p className="text-sm italic text-zinc-400">
              Preview appears here as you type…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
