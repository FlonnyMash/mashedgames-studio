"use client";

import { projectFetch } from "@/lib/project-api-client";
import type { GameProjectManifest, ParentDriftReport } from "@mashedgames/shared";
import { useConfiguratorStore } from "@mashedgames/configurator-engine";
import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

export function ParentDriftDialog({
  open,
  report,
  onDismiss,
  onAcknowledged,
}: {
  open: boolean;
  report: ParentDriftReport | null;
  onDismiss: () => void;
  onAcknowledged: () => void;
}) {
  const [acking, setAcking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectId = useConfiguratorStore((s) => s.projectId);

  const acknowledge = useCallback(async () => {
    if (!projectId) {
      return;
    }
    setAcking(true);
    setError(null);
    try {
      const response = await projectFetch(`/api/projects/${projectId}/ack-parent`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        manifest?: GameProjectManifest;
      };
      if (!response.ok || !data.ok || !data.manifest) {
        throw new Error(data.error ?? "Failed to acknowledge parent.");
      }
      useConfiguratorStore.getState().updateProjectManifest(data.manifest);
      onAcknowledged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acknowledge failed.");
    } finally {
      setAcking(false);
    }
  }, [onAcknowledged, projectId]);

  if (!open || !report) {
    return null;
  }

  const blocking = report.hasBlockingItems;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-labelledby="parent-drift-title"
        aria-modal="true"
        className="flex max-h-[min(90vh,36rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
      >
        <header className="border-b border-zinc-100 px-5 py-4">
          <h2 id="parent-drift-title" className="text-base font-semibold text-zinc-900">
            Parent template updates
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {report.parentTemplateId} changed since your last sync (
            {report.lockedVersion} → {report.liveVersion}). Review items below before
            continuing.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          {report.items.length === 0 ? (
            <p className="text-zinc-600">No differences detected.</p>
          ) : (
            <ul className="space-y-2">
              {report.items.map((item, index) => (
                <li
                  key={`${item.kind}-${item.targetPath ?? item.label}-${index}`}
                  className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
                >
                  <p className="font-medium text-zinc-900">{item.label}</p>
                  {item.detail ? (
                    <p className="text-xs text-zinc-500">{item.detail}</p>
                  ) : null}
                  {item.required ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Action required in branding panel
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex flex-col gap-2 border-t border-zinc-100 px-5 py-4">
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {!blocking ? (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Continue without syncing
              </button>
            ) : null}
            <button
              type="button"
              disabled={acking}
              onClick={() => void acknowledge()}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {acking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Acknowledge &amp; update lock
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
