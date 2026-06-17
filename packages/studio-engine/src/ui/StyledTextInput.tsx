"use client";

import { useRef } from "react";
import type { StyleBindings } from "@mashedgames/shared";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type StyledTextInputProps = {
  label: string;
  placeholder?: string;
  textValue: string;
  colorValue?: string;
  boldValue?: boolean;
  italicValue?: boolean;
  underlineValue?: boolean;
  styleBindings: StyleBindings;
  disabled?: boolean;
  onTextChange: (value: string) => void;
  onColorChange?: (value: string) => void;
  onBoldChange?: (value: boolean) => void;
  onItalicChange?: (value: boolean) => void;
  onUnderlineChange?: (value: boolean) => void;
};

// ---------------------------------------------------------------------------
// Component
//
// Layout:
//   [Label]                    [● B I U]   ← formatting toolbar
//   [────────── text input ──────────]     ← plain input, always readable
//   [── dark preview strip ──────────]     ← live preview on dark bg (game)
//
// The input never previews styles (white bg → white text = invisible).
// The preview strip uses the game's dark context so all colors/styles show.
// ---------------------------------------------------------------------------

export function StyledTextInput({
  label,
  placeholder,
  textValue,
  colorValue,
  boldValue = false,
  italicValue = false,
  underlineValue = false,
  styleBindings,
  disabled = false,
  onTextChange,
  onColorChange,
  onBoldChange,
  onItalicChange,
  onUnderlineChange,
}: StyledTextInputProps) {
  const colorInputRef = useRef<HTMLInputElement>(null);

  const hasToolbar =
    styleBindings.colorKey !== undefined ||
    styleBindings.boldKey !== undefined ||
    styleBindings.italicKey !== undefined ||
    styleBindings.underlineKey !== undefined;

  return (
    <div className="block space-y-1.5">
      {/* Label + inline toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-700">{label}</span>

        {hasToolbar && (
          <div className="flex items-center gap-0.5">
            {/* Color dot */}
            {styleBindings.colorKey !== undefined && (
              <div className="relative">
                <button
                  type="button"
                  title="Text color"
                  disabled={disabled}
                  onClick={() => colorInputRef.current?.click()}
                  style={{ backgroundColor: colorValue ?? "#6366f1" }}
                  className="h-5 w-5 rounded-full border border-zinc-300 shadow-sm transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                />
                <input
                  ref={colorInputRef}
                  type="color"
                  tabIndex={-1}
                  value={colorValue ?? "#6366f1"}
                  disabled={disabled}
                  onChange={(e) => onColorChange?.(e.target.value)}
                  className="pointer-events-none absolute h-0 w-0 opacity-0"
                />
              </div>
            )}

            {/* Bold */}
            {styleBindings.boldKey !== undefined && (
              <button
                type="button"
                title="Bold"
                disabled={disabled}
                onClick={() => onBoldChange?.(!boldValue)}
                className={[
                  "flex h-6 w-6 items-center justify-center rounded text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40",
                  boldValue
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
                ].join(" ")}
              >
                B
              </button>
            )}

            {/* Italic */}
            {styleBindings.italicKey !== undefined && (
              <button
                type="button"
                title="Italic"
                disabled={disabled}
                onClick={() => onItalicChange?.(!italicValue)}
                className={[
                  "flex h-6 w-6 items-center justify-center rounded text-xs italic transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40",
                  italicValue
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
                ].join(" ")}
              >
                I
              </button>
            )}

            {/* Underline */}
            {styleBindings.underlineKey !== undefined && (
              <button
                type="button"
                title="Underline"
                disabled={disabled}
                onClick={() => onUnderlineChange?.(!underlineValue)}
                className={[
                  "flex h-6 w-6 items-center justify-center rounded text-xs underline transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40",
                  underlineValue
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
                ].join(" ")}
              >
                U
              </button>
            )}
          </div>
        )}
      </div>

      {/* Plain input — styles apply in the game preview, not here */}
      <input
        type="text"
        value={textValue}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onTextChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}
