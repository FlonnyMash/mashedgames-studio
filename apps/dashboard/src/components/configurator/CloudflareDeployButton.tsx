"use client";

import { projectFetch } from "@/lib/project-api-client";
import { saveProjectClientNow } from "@/hooks/useSaveGameProject";
import { useConfiguratorStore } from "@mashedgames/configurator-engine";
import { CloudUpload, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

export function CloudflareDeployButton() {
  const projectId = useConfiguratorStore((s) => s.projectId);
  const [deploying, setDeploying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deploy = useCallback(async () => {
    if (!projectId) {
      setError("Open a project before deploying.");
      return;
    }

    setDeploying(true);
    setError(null);
    setMessage(null);

    try {
      await saveProjectClientNow(projectId);

      const response = await projectFetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Deploy failed.");
      }

      setMessage(data.message ?? "Pushed to repository successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setDeploying(false);
    }
  }, [projectId]);

  if (!projectId) {
    return null;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={deploying}
        onClick={() => void deploy()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        {deploying ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CloudUpload className="h-4 w-4" />
        )}
        Deploy to Cloudflare
      </button>
      {message ? (
        <p className="text-xs text-emerald-700" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
