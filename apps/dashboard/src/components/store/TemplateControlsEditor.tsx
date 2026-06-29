"use client";

import {
  TEMPLATE_CONTROL_PRESETS,
  type TemplateControlEntry,
} from "@mashedgames/shared";
import { Plus, Trash2 } from "lucide-react";

const PRESET_OPTIONS = [
  { id: "wasd" as const, label: "WASD" },
  { id: "arrowsSpace" as const, label: "Arrows + Space" },
  { id: "mouseTouch" as const, label: "Mouse / Touch" },
];

type TemplateControlsEditorProps = {
  value: TemplateControlEntry[];
  onChange: (controls: TemplateControlEntry[]) => void;
  variant?: "dark" | "light";
};

export function TemplateControlsEditor({
  value,
  onChange,
  variant = "dark",
}: TemplateControlsEditorProps) {
  const isDark = variant === "dark";

  const applyPreset = (presetId: keyof typeof TEMPLATE_CONTROL_PRESETS) => {
    onChange([...TEMPLATE_CONTROL_PRESETS[presetId]]);
  };

  const updateRow = (
    index: number,
    field: keyof TemplateControlEntry,
    next: string,
  ) => {
    onChange(
      value.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: next } : row,
      ),
    );
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, rowIndex) => rowIndex !== index));
  };

  const addRow = () => {
    onChange([...value, { key: "", action: "" }]);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p
          className={
            isDark
              ? "text-[11px] font-semibold uppercase tracking-widest text-zinc-400"
              : "text-[11px] font-semibold uppercase tracking-widest text-zinc-500"
          }
        >
          Quick presets
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className={
                isDark
                  ? "rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
                  : "rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
              }
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p
          className={
            isDark
              ? "text-[11px] font-semibold uppercase tracking-widest text-zinc-400"
              : "text-[11px] font-semibold uppercase tracking-widest text-zinc-500"
          }
        >
          Demo controls
        </p>

        {value.length === 0 ? (
          <p className={isDark ? "text-sm text-zinc-500" : "text-sm text-zinc-400"}>
            No controls configured. The demo view will hide the controls button.
          </p>
        ) : (
          <ul className="space-y-2">
            {value.map((row, index) => (
              <li key={`control-row-${index}`} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.key}
                  onChange={(event) => updateRow(index, "key", event.target.value)}
                  placeholder="Key"
                  className={
                    isDark
                      ? "min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
                      : "min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                  }
                />
                <input
                  type="text"
                  value={row.action}
                  onChange={(event) => updateRow(index, "action", event.target.value)}
                  placeholder="Action"
                  className={
                    isDark
                      ? "min-w-0 flex-[1.4] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
                      : "min-w-0 flex-[1.4] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                  }
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className={
                    isDark
                      ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition-colors hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300"
                      : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  }
                  aria-label="Remove control"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={addRow}
          className={
            isDark
              ? "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-white/35 hover:bg-white/5 hover:text-white"
              : "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
          }
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add control
        </button>
      </div>
    </div>
  );
}

export function sanitizeControlsForSave(
  controls: TemplateControlEntry[],
): TemplateControlEntry[] {
  return controls
    .map((entry) => ({
      key: entry.key.trim(),
      action: entry.action.trim(),
    }))
    .filter((entry) => entry.key.length > 0 && entry.action.length > 0);
}
