"use client";

import { useState } from "react";
import {
  resolveAssetPreviewUrl,
  type AssetPreviewContext,
  type TemplateFieldDescriptor,
} from "@mashedgames/shared";
import { ImageFieldInput } from "./ImageFieldInput";
import { NumberFieldInput } from "./NumberFieldInput";
import { SliderFieldInput } from "./SliderFieldInput";

// ---------------------------------------------------------------------------
// Dynamic renderer for a template's own fields (declared in its manifest.ts
// `fields: TemplateFieldDescriptor[]`). Unlike FlatConfigPanel — which is
// bound to universal `keyof GameConfig` keys — this panel renders whatever
// fields the active template declares, with zero per-template UI code.
// ---------------------------------------------------------------------------

export type TemplateFieldValues = Record<string, string | number | boolean>;

/** Humanizes a raw group id (e.g. "goodCollectibles") into "Good Collectibles". */
function humanizeGroupLabel(group: string): string {
  return group
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export type DynamicTemplateFieldPanelProps = {
  fields: TemplateFieldDescriptor[];
  values: TemplateFieldValues;
  onFieldChange: (key: string, value: string | number | boolean) => void;
  onImageFile?: (
    file: File,
    field: TemplateFieldDescriptor,
  ) => void | Promise<void>;
  assetPreviewContext?: AssetPreviewContext;
  disabled?: boolean;
};

function FieldControl({
  field,
  value,
  disabled,
  onFieldChange,
  onImageFile,
  assetPreviewContext,
}: {
  field: TemplateFieldDescriptor;
  value: string | number | boolean | undefined;
  disabled?: boolean;
  onFieldChange: DynamicTemplateFieldPanelProps["onFieldChange"];
  onImageFile: DynamicTemplateFieldPanelProps["onImageFile"];
  assetPreviewContext?: AssetPreviewContext;
}) {
  switch (field.type) {
    case "toggle": {
      const checked = typeof value === "boolean" ? value : Boolean(field.default);
      return (
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <span className="text-xs font-medium text-zinc-700">{field.label}</span>
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onFieldChange(field.key, !checked)}
            className={[
              "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40",
              checked ? "bg-indigo-500" : "bg-zinc-300",
            ].join(" ")}
          >
            <span
              className={[
                "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200",
                checked ? "translate-x-4" : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </label>
      );
    }

    case "color": {
      const colorValue =
        typeof value === "string" ? value : (field.default as string) || "#6366f1";
      return (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-700">{field.label}</span>
          <input
            type="color"
            disabled={disabled}
            value={colorValue}
            onChange={(e) => onFieldChange(field.key, e.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-zinc-200 bg-white disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>
      );
    }

    case "number": {
      return (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-700">{field.label}</span>
          <NumberFieldInput
            field={{
              min: field.min,
              max: field.max,
              step: field.step,
              defaultValue: typeof field.default === "number" ? field.default : undefined,
            }}
            value={typeof value === "number" ? value : undefined}
            disabled={disabled}
            onCommit={(next) => onFieldChange(field.key, next)}
          />
        </label>
      );
    }

    case "slider": {
      return (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-700">{field.label}</span>
          <SliderFieldInput
            field={{
              min: field.min,
              max: field.max,
              step: field.step,
              defaultValue: typeof field.default === "number" ? field.default : undefined,
            }}
            value={typeof value === "number" ? value : undefined}
            disabled={disabled}
            onCommit={(next) => onFieldChange(field.key, next)}
          />
        </label>
      );
    }

    case "image": {
      const stringValue = typeof value === "string" ? value : "";
      const previewSrc = resolveAssetPreviewUrl(stringValue, assetPreviewContext ?? {});
      return (
        <ImageFieldInput
          label={field.label}
          value={stringValue || undefined}
          previewSrc={previewSrc}
          disabled={disabled || !onImageFile}
          onFileSelect={(file) => {
            if (!onImageFile) {
              return;
            }
            return onImageFile(file, field);
          }}
          onClear={stringValue ? () => onFieldChange(field.key, "") : undefined}
        />
      );
    }

    case "text":
    case "styled-text":
    default: {
      const textValue = typeof value === "string" ? value : "";
      return (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-700">{field.label}</span>
          <input
            type="text"
            disabled={disabled}
            value={textValue}
            placeholder={field.placeholder}
            onChange={(e) => onFieldChange(field.key, e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-40"
          />
        </label>
      );
    }
  }
}

function FieldGroupSection({
  label,
  fields,
  values,
  disabled,
  onFieldChange,
  onImageFile,
  assetPreviewContext,
}: {
  label: string;
  fields: TemplateFieldDescriptor[];
  values: TemplateFieldValues;
  disabled?: boolean;
  onFieldChange: DynamicTemplateFieldPanelProps["onFieldChange"];
  onImageFile: DynamicTemplateFieldPanelProps["onImageFile"];
  assetPreviewContext?: AssetPreviewContext;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div
        className="flex cursor-pointer select-none items-center justify-between px-4 py-3"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <svg
          className={[
            "h-3.5 w-3.5 text-zinc-400 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </div>

      {open && (
        <div className="space-y-4 border-t border-zinc-100 px-4 pb-4 pt-3">
          {fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={values[field.key]}
              disabled={disabled}
              onFieldChange={onFieldChange}
              onImageFile={onImageFile}
              assetPreviewContext={assetPreviewContext}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DynamicTemplateFieldPanel({
  fields,
  values,
  onFieldChange,
  onImageFile,
  assetPreviewContext,
  disabled,
}: DynamicTemplateFieldPanelProps) {
  if (fields.length === 0) {
    return null;
  }

  const grouped = new Map<string, TemplateFieldDescriptor[]>();
  const ungrouped: TemplateFieldDescriptor[] = [];

  for (const field of fields) {
    if (!field.group) {
      ungrouped.push(field);
      continue;
    }
    const bucket = grouped.get(field.group) ?? [];
    bucket.push(field);
    grouped.set(field.group, bucket);
  }

  return (
    <div className="space-y-3">
      {ungrouped.length > 0 && (
        <div className="space-y-4">
          {ungrouped.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={values[field.key]}
              disabled={disabled}
              onFieldChange={onFieldChange}
              onImageFile={onImageFile}
              assetPreviewContext={assetPreviewContext}
            />
          ))}
        </div>
      )}

      {Array.from(grouped.entries()).map(([group, groupFields]) => (
        <FieldGroupSection
          key={group}
          label={humanizeGroupLabel(group)}
          fields={groupFields}
          values={values}
          disabled={disabled}
          onFieldChange={onFieldChange}
          onImageFile={onImageFile}
          assetPreviewContext={assetPreviewContext}
        />
      ))}
    </div>
  );
}
