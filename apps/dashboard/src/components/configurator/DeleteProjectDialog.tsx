"use client";

import { projectFetch } from "@/lib/project-api-client";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

const CONFIRMATION_TEXT = "delete";

const inputClass =
  "w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-red-300 focus:bg-white focus:ring-4 focus:ring-red-500/10";

export function DeleteProjectDialog({
  open,
  projectId,
  projectLabel,
  onClose,
  onDeleted,
}: {
  open: boolean;
  projectId: string;
  projectLabel: string;
  onClose: () => void;
  onDeleted?: (projectId: string) => void;
}) {
  const titleId = useId();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === CONFIRMATION_TEXT && !deleting;

  useEffect(() => {
    if (open) {
      setConfirmText("");
      setError(null);
      setDeleting(false);
    }
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleting, onClose, open]);

  const handleDelete = async () => {
    if (!canDelete) return;

    setDeleting(true);
    setError(null);

    try {
      const response = await projectFetch(
        `/api/projects/${encodeURIComponent(projectId)}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not delete project.");
      }

      onDeleted?.(projectId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="presentation"
      onClick={deleting ? undefined : onClose}
    >
      <div className="absolute inset-0 bg-zinc-900/30 backdrop-blur-sm" aria-hidden />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-[15px] font-semibold text-zinc-900">
          Delete project?
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          This permanently removes{" "}
          <span className="font-medium text-zinc-900">{projectLabel}</span> (
          <code className="text-xs">{projectId}</code>) and its files from your
          workspace. This cannot be undone.
        </p>

        <label className="mt-5 block space-y-1.5">
          <span className="text-xs font-medium text-zinc-700">
            Type <span className="font-mono">{CONFIRMATION_TEXT}</span> to confirm
          </span>
          <input
            type="text"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            autoComplete="off"
            autoFocus
            disabled={deleting}
            placeholder={CONFIRMATION_TEXT}
            className={inputClass}
          />
        </label>

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!canDelete}
            className="inline-flex min-w-[7rem] items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Deleting…
              </>
            ) : (
              "Delete project"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
