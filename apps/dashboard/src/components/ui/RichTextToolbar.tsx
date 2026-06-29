"use client";

import type { Editor } from "@tiptap/core";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Italic,
  List,
  ListOrdered,
  RotateCcw,
  Strikethrough,
  Underline,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getBlockLineHeight } from "@/lib/tiptap/block-line-height";

export const BLOCK_TYPE_OPTIONS = [
  { value: "paragraph", label: "Normal text" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
] as const;

export const FONT_SIZE_OPTIONS = [
  { value: "", label: "Automatic" },
  { value: "12px", label: "12 px" },
  { value: "14px", label: "14 px" },
  { value: "16px", label: "16 px" },
  { value: "18px", label: "18 px" },
  { value: "20px", label: "20 px" },
  { value: "24px", label: "24 px" },
  { value: "28px", label: "28 px" },
  { value: "32px", label: "32 px" },
  { value: "40px", label: "40 px" },
] as const;

export const LINE_HEIGHT_OPTIONS = [
  { value: "", label: "Automatic" },
  { value: "0.75", label: "0.75 — Very compact" },
  { value: "0.8", label: "0.8 — Compact" },
  { value: "0.85", label: "0.85" },
  { value: "0.9", label: "0.9 — Tight" },
  { value: "0.95", label: "0.95" },
  { value: "1", label: "1.0 — Normal" },
  { value: "1.1", label: "1.1" },
  { value: "1.15", label: "1.15" },
  { value: "1.2", label: "1.2" },
  { value: "1.25", label: "1.25 — Relaxed" },
  { value: "1.35", label: "1.35" },
  { value: "1.5", label: "1.5 — Loose" },
  { value: "1.75", label: "1.75" },
  { value: "2", label: "2.0 — Double" },
] as const;

export const TEXT_COLOR_OPTIONS = [
  { value: "", label: "Automatic", color: "#d4d4d8" },
  { value: "#000000", label: "Black", color: "#000000" },
  { value: "#ffffff", label: "White", color: "#ffffff" },
  { value: "#e4e4e7", label: "Zinc 200", color: "#e4e4e7" },
  { value: "#d4d4d8", label: "Zinc 300", color: "#d4d4d8" },
  { value: "#a1a1aa", label: "Zinc 400", color: "#a1a1aa" },
  { value: "#71717a", label: "Zinc 500", color: "#71717a" },
  { value: "#52525b", label: "Zinc 600", color: "#52525b" },
  { value: "#fef08a", label: "Light yellow", color: "#fef08a" },
  { value: "#fde047", label: "Yellow", color: "#fde047" },
  { value: "#fbbf24", label: "Gold", color: "#fbbf24" },
  { value: "#fb923c", label: "Orange", color: "#fb923c" },
  { value: "#f97316", label: "Vivid orange", color: "#f97316" },
  { value: "#fca5a5", label: "Light red", color: "#fca5a5" },
  { value: "#f87171", label: "Red", color: "#f87171" },
  { value: "#fb7185", label: "Rose", color: "#fb7185" },
  { value: "#f472b6", label: "Pink", color: "#f472b6" },
  { value: "#ec4899", label: "Vivid pink", color: "#ec4899" },
  { value: "#c084fc", label: "Light purple", color: "#c084fc" },
  { value: "#a78bfa", label: "Violet", color: "#a78bfa" },
  { value: "#818cf8", label: "Indigo", color: "#818cf8" },
  { value: "#6366f1", label: "Vivid indigo", color: "#6366f1" },
  { value: "#93c5fd", label: "Light blue", color: "#93c5fd" },
  { value: "#60a5fa", label: "Blue", color: "#60a5fa" },
  { value: "#38bdf8", label: "Sky", color: "#38bdf8" },
  { value: "#22d3ee", label: "Cyan", color: "#22d3ee" },
  { value: "#2dd4bf", label: "Teal", color: "#2dd4bf" },
  { value: "#34d399", label: "Emerald", color: "#34d399" },
  { value: "#4ade80", label: "Light green", color: "#4ade80" },
  { value: "#22c55e", label: "Green", color: "#22c55e" },
  { value: "#a3e635", label: "Lime", color: "#a3e635" },
  { value: "#84cc16", label: "Vivid lime", color: "#84cc16" },
] as const;

function ToolbarButton({
  active,
  onClick,
  label,
  children,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        active
          ? "bg-white text-zinc-900 shadow-sm"
          : "text-zinc-400 hover:bg-white/10 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

function LabeledSelect({
  title,
  value,
  onChange,
  options,
  vertical,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  vertical?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1", vertical ? "w-full" : "shrink-0")}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </span>
      <select
        aria-label={title}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full cursor-pointer rounded-md border border-zinc-700/80 bg-zinc-900/90 px-2 text-xs text-zinc-200 outline-none transition-colors hover:border-zinc-600 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500",
          vertical ? "h-8" : "h-8 min-w-[9.5rem]",
        )}
      >
        {options.map((opt) => (
          <option key={opt.value || "default"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToolbarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </span>
      {children}
    </div>
  );
}

function getActiveBlockType(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  return "paragraph";
}

function getActiveFontSize(editor: Editor): string {
  const attrs = editor.getAttributes("textStyle");
  return typeof attrs.fontSize === "string" ? attrs.fontSize : "";
}

function getActiveLineHeight(editor: Editor): string {
  return getBlockLineHeight(editor);
}

export function getActiveTextColor(editor: Editor): string {
  const attrs = editor.getAttributes("textStyle");
  return typeof attrs.color === "string" ? attrs.color : "";
}

function applyBlockType(editor: Editor, type: string) {
  const chain = editor.chain().focus();
  if (type === "paragraph") {
    chain.setParagraph().run();
    return;
  }
  const level = type === "h1" ? 1 : type === "h2" ? 2 : 3;
  chain.setHeading({ level: level as 1 | 2 | 3 }).run();
}

export function resetRichTextFormatting(editor: Editor) {
  editor
    .chain()
    .focus()
    .unsetAllMarks()
    .unsetColor()
    .unsetFontSize()
    .unsetLineHeight()
    .setParagraph()
    .unsetTextAlign()
    .run();
}

function swatchBorder(hex: string): string {
  if (hex === "#000000") return "border-zinc-500";
  if (hex === "#ffffff") return "border-zinc-400";
  return "border-zinc-600";
}

function ColorPickerPopover({
  editor,
  isDark,
}: {
  editor: Editor;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeColor = getActiveTextColor(editor);
  const activeLabel =
    TEXT_COLOR_OPTIONS.find(
      (opt) => opt.value.toLowerCase() === activeColor.toLowerCase(),
    )?.label ?? (activeColor ? activeColor : "Automatic");

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
          isDark
            ? "border-zinc-700/80 bg-zinc-900/90 hover:border-zinc-600"
            : "border-zinc-200 bg-white hover:border-zinc-300",
        )}
      >
        <span
          className={cn(
            "h-4 w-4 shrink-0 rounded-full border",
            !activeColor && "bg-gradient-to-br from-zinc-200 to-zinc-500",
            activeColor && swatchBorder(activeColor),
          )}
          style={activeColor ? { backgroundColor: activeColor } : undefined}
        />
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
          {activeLabel}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Choose text color"
          className="absolute left-full top-0 z-50 ml-2 w-44 rounded-xl border border-zinc-700 bg-zinc-950 p-2 shadow-2xl"
        >
          <div className="grid grid-cols-4 gap-1.5">
            {TEXT_COLOR_OPTIONS.map((color) => {
              const isActive =
                getActiveTextColor(editor).toLowerCase() === color.value.toLowerCase();
              return (
                <button
                  key={color.value || "default"}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  title={color.label}
                  aria-label={color.label}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (!color.value) {
                      editor.chain().focus().unsetColor().run();
                    } else {
                      editor.chain().focus().setColor(color.value).run();
                    }
                    setOpen(false);
                  }}
                  className={cn(
                    "h-7 w-7 rounded-md border transition-transform hover:scale-105",
                    isActive
                      ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900"
                      : swatchBorder(color.value || ""),
                    !color.value && "bg-gradient-to-br from-zinc-200 to-zinc-500",
                  )}
                  style={color.value ? { backgroundColor: color.color } : undefined}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RichTextToolbar({
  editor,
  variant = "dark",
  layout = "horizontal",
  className,
}: {
  editor: Editor;
  variant?: "light" | "dark";
  layout?: "horizontal" | "vertical";
  className?: string;
}) {
  const isDark = variant === "dark";
  const iconClass = "h-4 w-4";

  const preventBlur = (event: React.MouseEvent) => {
    const tag = (event.target as HTMLElement).tagName;
    if (tag !== "SELECT" && tag !== "OPTION") {
      event.preventDefault();
    }
  };

  if (layout === "vertical") {
    return (
      <div
        className={cn("flex w-full flex-col gap-3", className)}
        role="toolbar"
        aria-label="Text formatting"
        onMouseDown={preventBlur}
      >
        <LabeledSelect
          vertical
          title="Text type"
          value={getActiveBlockType(editor)}
          onChange={(value) => applyBlockType(editor, value)}
          options={BLOCK_TYPE_OPTIONS}
        />

        <LabeledSelect
          vertical
          title="Font size"
          value={getActiveFontSize(editor)}
          onChange={(value) => {
            if (!value) {
              editor.chain().focus().unsetFontSize().run();
              return;
            }
            editor.chain().focus().setFontSize(value).run();
          }}
          options={FONT_SIZE_OPTIONS}
        />

        <LabeledSelect
          vertical
          title="Line height"
          value={getActiveLineHeight(editor)}
          onChange={(value) => {
            if (!value) {
              editor.chain().focus().unsetLineHeight().run();
              return;
            }
            editor.chain().focus().setLineHeight(value).run();
          }}
          options={LINE_HEIGHT_OPTIONS}
        />

        <ToolbarSection title="Format">
          <div className="grid grid-cols-4 gap-0.5">
            <ToolbarButton
              label="Bold"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
            <ToolbarButton
              label="Italic"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
            <ToolbarButton
              label="Underline"
              active={editor.isActive("underline")}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <Underline className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
            <ToolbarButton
              label="Strikethrough"
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
          </div>
        </ToolbarSection>

        <ToolbarSection title="Alignment">
          <div className="grid grid-cols-4 gap-0.5">
            <ToolbarButton
              label="Align left"
              active={editor.isActive({ textAlign: "left" })}
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
            >
              <AlignLeft className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
            <ToolbarButton
              label="Align center"
              active={editor.isActive({ textAlign: "center" })}
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
            >
              <AlignCenter className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
            <ToolbarButton
              label="Align right"
              active={editor.isActive({ textAlign: "right" })}
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
            >
              <AlignRight className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
            <ToolbarButton
              label="Justify"
              active={editor.isActive({ textAlign: "justify" })}
              onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            >
              <AlignJustify className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
          </div>
        </ToolbarSection>

        <ToolbarSection title="Lists">
          <div className="grid grid-cols-2 gap-0.5">
            <ToolbarButton
              label="Bullet list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
            <ToolbarButton
              label="Numbered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className={iconClass} strokeWidth={2.25} />
            </ToolbarButton>
          </div>
        </ToolbarSection>

        <ToolbarSection title="Text color">
          <ColorPickerPopover editor={editor} isDark={isDark} />
        </ToolbarSection>

        <ToolbarSection title="Reset">
          <ToolbarButton
            label="Reset formatting"
            onClick={() => resetRichTextFormatting(editor)}
            className="w-full text-zinc-500 hover:text-red-300"
          >
            <RotateCcw className={iconClass} strokeWidth={2.25} />
          </ToolbarButton>
        </ToolbarSection>
      </div>
    );
  }

  return null;
}
