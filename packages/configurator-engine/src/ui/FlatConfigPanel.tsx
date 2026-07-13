"use client";

import { useState } from "react";
import type {
  FlatFieldDefinition,
  GameConfig,
  GroupDefinition,
} from "@mashedgames/shared";
import {
  fieldsForGroup,
  groupsForMode,
  resolveAssetPreviewUrl,
  ungroupedFields,
  type AssetPreviewContext,
} from "@mashedgames/shared";
import { ImageFieldInput } from "./ImageFieldInput";
import { NumberFieldInput, type NumericFieldConstraints } from "./NumberFieldInput";
import { SliderFieldInput } from "./SliderFieldInput";
import { StyledTextInput } from "./StyledTextInput";

/** FlatFieldDefinition.defaultValue is a wider union than numeric inputs need. */
function numericConstraints(field: FlatFieldDefinition): NumericFieldConstraints {
  return {
    min: field.min,
    max: field.max,
    step: field.step,
    defaultValue:
      typeof field.defaultValue === "number" ? field.defaultValue : undefined,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FlatConfigPanelProps = {
  config: GameConfig;
  onFieldChange: <K extends keyof GameConfig>(
    key: K,
    value: GameConfig[K],
  ) => void;
  onImageFile?: (
    file: File,
    field: FlatFieldDefinition,
  ) => void | Promise<void>;
  mode?: "studio" | "configurator";
  assetPreviewContext?: AssetPreviewContext;
};

// ---------------------------------------------------------------------------
// Individual field renderer
// ---------------------------------------------------------------------------

function FieldControl({
  field,
  config,
  disabled,
  onFieldChange,
  onImageFile,
  assetPreviewContext,
}: {
  field: FlatFieldDefinition;
  /** Full config needed to read style-binding values for "styled-text" fields. */
  config: GameConfig;
  disabled?: boolean;
  onFieldChange: FlatConfigPanelProps["onFieldChange"];
  onImageFile: FlatConfigPanelProps["onImageFile"];
  assetPreviewContext?: AssetPreviewContext;
}) {
  const value = config[field.key];

  if (field.type === "styled-text") {
    const bindings = field.styleBindings ?? {};
    return (
      <StyledTextInput
        label={field.label}
        placeholder={field.placeholder}
        textValue={typeof value === "string" ? value : ""}
        styleBindings={bindings}
        colorValue={
          bindings.colorKey
            ? (config[bindings.colorKey] as string | undefined)
            : undefined
        }
        boldValue={
          bindings.boldKey
            ? (config[bindings.boldKey] as boolean | undefined)
            : undefined
        }
        italicValue={
          bindings.italicKey
            ? (config[bindings.italicKey] as boolean | undefined)
            : undefined
        }
        underlineValue={
          bindings.underlineKey
            ? (config[bindings.underlineKey] as boolean | undefined)
            : undefined
        }
        disabled={disabled}
        onTextChange={(v) => onFieldChange(field.key, v as never)}
        onColorChange={
          bindings.colorKey
            ? (v) => onFieldChange(bindings.colorKey!, v as never)
            : undefined
        }
        onBoldChange={
          bindings.boldKey
            ? (v) => onFieldChange(bindings.boldKey!, v as never)
            : undefined
        }
        onItalicChange={
          bindings.italicKey
            ? (v) => onFieldChange(bindings.italicKey!, v as never)
            : undefined
        }
        onUnderlineChange={
          bindings.underlineKey
            ? (v) => onFieldChange(bindings.underlineKey!, v as never)
            : undefined
        }
      />
    );
  }

  if (field.type === "color") {
    return (
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-zinc-700">{field.label}</span>
        <input
          type="color"
          disabled={disabled}
          value={typeof value === "string" ? value : "#6366f1"}
          onChange={(e) => onFieldChange(field.key, e.target.value as never)}
          className="h-10 w-full cursor-pointer rounded-lg border border-zinc-200 bg-white disabled:cursor-not-allowed disabled:opacity-40"
        />
      </label>
    );
  }

  if (field.type === "toggle") {
    const checked = typeof value === "boolean" ? value : false;
    return (
      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
        <span className="text-xs font-medium text-zinc-700">{field.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onFieldChange(field.key, (!checked) as never)}
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

  if (field.type === "number") {
    return (
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-zinc-700">{field.label}</span>
        <NumberFieldInput
          field={numericConstraints(field)}
          value={typeof value === "number" ? value : undefined}
          disabled={disabled}
          onCommit={(next) => onFieldChange(field.key, next as never)}
        />
      </label>
    );
  }

  if (field.type === "slider") {
    return (
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-zinc-700">{field.label}</span>
        <SliderFieldInput
          field={numericConstraints(field)}
          value={typeof value === "number" ? value : undefined}
          disabled={disabled}
          onCommit={(next) => onFieldChange(field.key, next as never)}
        />
      </label>
    );
  }

  if (field.type === "image") {
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
        onClear={
          stringValue
            ? () => onFieldChange(field.key, "" as never)
            : undefined
        }
      />
    );
  }

  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-700">{field.label}</span>
      <input
        type="text"
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        onChange={(e) => onFieldChange(field.key, e.target.value as never)}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-40"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Inline master-visibility toggle for the group header
// ---------------------------------------------------------------------------

function MasterToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={[
        "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
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
  );
}

// ---------------------------------------------------------------------------
// Single accordion group
// ---------------------------------------------------------------------------

function GroupAccordion({
  group,
  fields,
  config,
  onFieldChange,
  onImageFile,
  assetPreviewContext,
}: {
  group: GroupDefinition;
  fields: FlatFieldDefinition[];
  config: GameConfig;
  onFieldChange: FlatConfigPanelProps["onFieldChange"];
  onImageFile: FlatConfigPanelProps["onImageFile"];
  assetPreviewContext?: AssetPreviewContext;
}) {
  const [open, setOpen] = useState(!group.defaultCollapsed);

  const masterKey = group.masterVisibilityKey;
  const masterValue = masterKey !== undefined ? config[masterKey] : undefined;
  const isEnabled = masterValue === undefined || masterValue === true;

  const hasBody = fields.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {/* Header */}
      <div
        className={[
          "flex items-center justify-between px-4 py-3",
          hasBody ? "cursor-pointer select-none" : "",
        ].join(" ")}
        onClick={() => hasBody && setOpen((o) => !o)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {group.label}
        </span>
        <div className="flex items-center gap-3">
          {masterKey !== undefined && (
            <MasterToggle
              checked={isEnabled}
              onChange={(next) => onFieldChange(masterKey, next as never)}
            />
          )}
          {hasBody && (
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
          )}
        </div>
      </div>

      {/* Body */}
      {hasBody && open && (
        <div
          className={[
            "space-y-4 border-t border-zinc-100 px-4 pb-4 pt-3",
            !isEnabled ? "pointer-events-none opacity-40" : "",
          ].join(" ")}
        >
          {fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              config={config}
              disabled={!isEnabled}
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

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function FlatConfigPanel({
  config,
  onFieldChange,
  onImageFile,
  mode = "configurator",
  assetPreviewContext,
}: FlatConfigPanelProps) {
  const templateId = config.activeTemplateId;
  const groups = groupsForMode(mode, templateId);
  const loose = ungroupedFields(mode, templateId);

  return (
    <div className="space-y-3">
      {loose.length > 0 && (
        <div className="space-y-4">
          {loose.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              config={config}
              onFieldChange={onFieldChange}
              onImageFile={onImageFile}
              assetPreviewContext={assetPreviewContext}
            />
          ))}
        </div>
      )}

      {groups.map((group) => (
        <GroupAccordion
          key={group.id}
          group={group}
          fields={fieldsForGroup(group.id, mode, templateId)}
          config={config}
          onFieldChange={onFieldChange}
          onImageFile={onImageFile}
          assetPreviewContext={assetPreviewContext}
        />
      ))}
    </div>
  );
}
