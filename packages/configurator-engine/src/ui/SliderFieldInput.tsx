"use client";

import { useEffect, useState } from "react";
import type { NumericFieldConstraints } from "./NumberFieldInput";

type SliderFieldInputProps = {
  field: NumericFieldConstraints;
  value: number | undefined;
  disabled?: boolean;
  onCommit: (value: number) => void;
};

function resolveSliderValue(
  value: number | undefined,
  field: NumericFieldConstraints,
): number {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof field.defaultValue === "number") {
    return field.defaultValue;
  }
  return field.min ?? 0;
}

function clampSliderValue(
  raw: number,
  field: NumericFieldConstraints,
): number {
  let next = raw;
  if (field.min !== undefined) {
    next = Math.max(field.min, next);
  }
  if (field.max !== undefined) {
    next = Math.min(field.max, next);
  }
  return next;
}

export function SliderFieldInput({
  field,
  value,
  disabled,
  onCommit,
}: SliderFieldInputProps) {
  const resolvedValue = resolveSliderValue(value, field);
  const [draft, setDraft] = useState(resolvedValue);

  useEffect(() => {
    setDraft(resolveSliderValue(value, field));
  }, [field, value]);

  const commit = (raw: number): void => {
    const next = clampSliderValue(raw, field);
    setDraft(next);
    onCommit(next);
  };

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        disabled={disabled}
        value={draft}
        onChange={(event) => commit(Number(event.target.value))}
        className="h-2 min-w-0 flex-1 cursor-pointer accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-zinc-600">
        {draft}%
      </span>
    </div>
  );
}
