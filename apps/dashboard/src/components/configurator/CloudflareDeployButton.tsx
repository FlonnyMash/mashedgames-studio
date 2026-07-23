"use client";

import { projectFetch } from "@/lib/project-api-client";
import { saveProjectClientNow } from "@/hooks/useSaveGameProject";
import { useConfiguratorStore } from "@mashedgames/configurator-engine";
import { CloudUpload, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export function CloudflareDeployButton() {
  const projectId = useConfiguratorStore((s) => s.projectId);
  const [deploying, setDeploying] = useState(false);

  const deploy = useCallback(async () => {
    if (!projectId) {
      toast.error("Open a project before deploying.");
      return;
    }

    setDeploying(true);
    const toastId = toast.loading("Deploying to Cloudflare Pages…");

    try {
      await saveProjectClientNow(projectId);

      const response = await projectFetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        url?: string;
        gameId?: string | null;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Deploy failed.");
      }

      // Sync any freshly-minted Supabase games.id into local state so the
      // Webhook Integrations panel unlocks without requiring a refresh.
      if (typeof data.gameId === "string" && data.gameId) {
        useConfiguratorStore.getState().setGameId(data.gameId);
      }

      const url = data.url;
      toast.success("Deployed to Cloudflare Pages", {
        id: toastId,
        duration: 10000,
        description: url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 underline underline-offset-2 hover:text-emerald-700"
          >
            {url}
          </a>
        ) : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deploy failed.", {
        id: toastId,
      });
    } finally {
      setDeploying(false);
    }
  }, [projectId]);

  if (!projectId) {
    return null;
  }

  return (
    <button
      type="button"
      disabled={deploying}
      onClick={() => void deploy()}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {deploying ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CloudUpload className="h-4 w-4" />
      )}
      {deploying ? "Deploying…" : "Deploy to Cloudflare"}
    </button>
  );
}
