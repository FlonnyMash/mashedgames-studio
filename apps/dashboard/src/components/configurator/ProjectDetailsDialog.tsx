"use client";

import { DeleteProjectDialog } from "@/components/configurator/DeleteProjectDialog";
import { projectFetch } from "@/lib/project-api-client";
import type { GameProjectManifest } from "@mashedgames/shared";
import { Check, ExternalLink, FolderOpen, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

const inputClass =
  "w-full rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-4 focus:ring-zinc-900/5";

const labelClass = "text-[11px] font-medium uppercase tracking-wider text-zinc-400";

type ProjectDetailsPayload = {
  projectId: string;
  repositoryPath: string;
  manifest: GameProjectManifest;
  createdAt: string;
  updatedAt: string;
};

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ProjectDetailsDialog({
  projectId,
  open,
  onClose,
  onSaved,
  onDeleted,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (manifest: GameProjectManifest) => void;
  onDeleted?: (projectId: string) => void;
}) {
  const titleId = useId();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<ProjectDetailsPayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isDirty = useMemo(() => {
    if (!details) return false;
    return displayName.trim() !== details.manifest.displayName;
  }, [details, displayName]);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await projectFetch(
        `/api/projects/${encodeURIComponent(projectId)}/details`,
      );
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
      } & Partial<ProjectDetailsPayload>;

      if (!response.ok || !data.ok || !data.manifest) {
        throw new Error(data.error ?? "Could not load project details.");
      }

      setDetails(data as ProjectDetailsPayload);
      setDisplayName(data.manifest.displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed.");
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      setSaveSuccess(false);
      void loadDetails();
    }
  }, [open, loadDetails]);

  useEffect(() => {
    if (isDirty) {
      setSaveSuccess(false);
    }
  }, [isDirty]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await projectFetch(
        `/api/projects/${encodeURIComponent(projectId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName }),
        },
      );
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        manifest?: GameProjectManifest;
      };

      if (!response.ok || !data.ok || !data.manifest) {
        throw new Error(data.error ?? "Could not save changes.");
      }

      const manifest = data.manifest;
      setDetails((prev) =>
        prev
          ? {
              ...prev,
              manifest,
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
      setDisplayName(manifest.displayName);
      setSaveSuccess(true);
      setError(null);
      onSaved?.(manifest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFolder = async () => {
    setOpeningFolder(true);
    setError(null);
    try {
      const response = await projectFetch(
        `/api/projects/${encodeURIComponent(projectId)}/open-folder`,
        { method: "POST" },
      );
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not open folder.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open folder.");
    } finally {
      setOpeningFolder(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-zinc-900/25 backdrop-blur-md" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h2 id={titleId} className="text-[15px] font-semibold text-zinc-900">
            Project details
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : details ? (
            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className={labelClass}>Display name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass}
                />
              </label>

              <div className="space-y-1.5">
                <span className={labelClass}>Project ID</span>
                <p className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 font-mono text-sm text-zinc-600">
                  {details.projectId}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className={labelClass}>Parent template</span>
                  <p className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 text-sm text-zinc-700">
                    {details.manifest.parentTemplateId}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <span className={labelClass}>Parent version</span>
                  <p className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 text-sm text-zinc-700">
                    v{details.manifest.parentVersion}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className={labelClass}>Location</span>
                <div className="flex gap-2">
                  <p className="min-w-0 flex-1 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-zinc-600">
                    {details.repositoryPath}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleOpenFolder()}
                    disabled={openingFolder}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {openingFolder ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5" />
                    )}
                    Open
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4">
                <div className="space-y-1">
                  <span className={labelClass}>Created</span>
                  <p className="text-sm text-zinc-700">
                    {formatDateTime(details.createdAt)}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className={labelClass}>Last modified</span>
                  <p className="text-sm text-zinc-700">
                    {formatDateTime(details.updatedAt)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-zinc-500">
              {error ?? "Project not found."}
            </p>
          )}
        </div>

        {error && details ? (
          <p
            className="shrink-0 border-t border-red-100 bg-red-50 px-6 py-2.5 text-xs text-red-600"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <footer className="shrink-0 border-t border-zinc-100 bg-zinc-50/50 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {details ? (
              <div className="flex flex-col items-start gap-2">
                <a
                  href={`/configurator?project=${encodeURIComponent(projectId)}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Open in Configurator
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  disabled={saving}
                  className="text-xs font-medium text-red-600 transition-colors hover:text-red-800 disabled:opacity-50"
                >
                  Delete project…
                </button>
              </div>
            ) : (
              <span className="hidden sm:block" />
            )}

            {saveSuccess && !isDirty ? (
              <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                <span
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600"
                  role="status"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Saved
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-w-[88px] rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex w-full justify-end gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || loading || !details || !isDirty}
                  className="inline-flex min-w-[88px] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            )}
          </div>
        </footer>
      </div>

      <DeleteProjectDialog
        open={deleteOpen}
        projectId={projectId}
        projectLabel={details?.manifest.displayName ?? projectId}
        onClose={() => setDeleteOpen(false)}
        onDeleted={(deletedId) => {
          setDeleteOpen(false);
          onClose();
          onDeleted?.(deletedId);
        }}
      />
    </div>
  );
}
