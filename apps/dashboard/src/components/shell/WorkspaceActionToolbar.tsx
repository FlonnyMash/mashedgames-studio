"use client";

import { Loader2, Redo2, RotateCcw, Save, Undo2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";

type BtnStatus = "idle" | "busy" | "success" | "error";

function useAsyncButton(fn: (() => Promise<void>) | undefined) {
  const [status, setStatus] = useState<BtnStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(async () => {
    if (!fn || status === "busy") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("busy");
    try {
      await fn();
      setStatus("success");
      timerRef.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      timerRef.current = setTimeout(() => setStatus("idle"), 3000);
    }
  }, [fn, status]);

  return { status, trigger };
}

function iconBtnClass(status: BtnStatus): string {
  const base =
    "relative flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  switch (status) {
    case "success":
      return `${base} border-green-200 bg-green-50 text-green-700`;
    case "error":
      return `${base} border-red-200 bg-red-50 text-red-700`;
    default:
      return `${base} border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900`;
  }
}

export interface WorkspaceActionToolbarProps {
  /** undefined = undo/redo are not available for this surface (buttons are disabled). */
  onUndo?: () => void;
  onRedo?: () => void;
  onRevert: () => Promise<void>;
  onSave: () => Promise<void>;
  /** When true, an amber dot indicator appears on the save button. */
  hasUnsaved?: boolean;
}

/**
 * Compact icon-only action bar: Undo · Revert · Save.
 * Tooltips via native `title` attributes; no external library required.
 */
export function WorkspaceActionToolbar({
  onUndo,
  onRedo,
  onRevert,
  onSave,
  hasUnsaved = false,
}: WorkspaceActionToolbarProps) {
  const revert = useAsyncButton(onRevert);
  const save = useAsyncButton(onSave);

  return (
    <div
      className="flex items-center gap-1"
      role="toolbar"
      aria-label="Workspace actions"
    >
      {/* Undo */}
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        onClick={onUndo}
        disabled={!onUndo}
        className={iconBtnClass("idle")}
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden />
      </button>

      {/* Redo */}
      <button
        type="button"
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
        onClick={onRedo}
        disabled={!onRedo}
        className={iconBtnClass("idle")}
      >
        <Redo2 className="h-3.5 w-3.5" aria-hidden />
      </button>

      {/* Revert to saved */}
      <button
        type="button"
        title="Revert to last save"
        aria-label="Revert to last save"
        onClick={() => void revert.trigger()}
        disabled={revert.status === "busy"}
        className={iconBtnClass(revert.status)}
      >
        {revert.status === "busy" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>

      {/* Save */}
      <button
        type="button"
        title="Save (Ctrl+S)"
        aria-label="Save"
        onClick={() => void save.trigger()}
        disabled={save.status === "busy"}
        className={iconBtnClass(save.status)}
      >
        {save.status === "busy" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Save className="h-3.5 w-3.5" aria-hidden />
        )}
        {hasUnsaved && save.status === "idle" ? (
          <span
            className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400"
            aria-label="unsaved changes"
          />
        ) : null}
      </button>
    </div>
  );
}
