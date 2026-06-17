"use client";

import { useEffect, useState } from "react";
import type { FlatFieldDefinition } from "@mashedgames/shared";

type NumberFieldInputProps = {
  field: FlatFieldDefinition;
  value: number | undefined;
  disabled?: boolean;
  onCommit: (value: number) => void;
};

function resolveNumberValue(
  value: number | undefined,
  field: FlatFieldDefinition,
): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof field.defaultValue === "number") {
    return field.defaultValue;
  }
  return undefined;
}

export function NumberFieldInput({
  field,
  value,
  disabled,
  onCommit,
}: NumberFieldInputProps) {
  const resolvedValue = resolveNumberValue(value, field);
  const [draft, setDraft] = useState(
    typeof resolvedValue === "number" ? String(resolvedValue) : "",
  );

  useEffect(() => {
    const next = resolveNumberValue(value, field);
    if (typeof next === "number") {
      setDraft(String(next));
    }
  }, [field, value]);

  const commitDraft = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-") {
      if (typeof resolvedValue === "number") {
        setDraft(String(resolvedValue));
      }
      return;
    }

    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      if (typeof resolvedValue === "number") {
        setDraft(String(resolvedValue));
      }
      return;
    }

    let next = parsed;
    if (field.min !== undefined) {
      next = Math.max(field.min, next);
    }
    if (field.max !== undefined) {
      next = Math.min(field.max, next);
    }

    onCommit(next);
    setDraft(String(next));
  };

  return (
    <input
      type="number"
      min={field.min}
      max={field.max}
      step={field.step}
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commitDraft(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commitDraft(draft);
        }
      }}
      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-40"
    />
  );
}
