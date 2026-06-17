"use client";

import {
  ProjectListRow,
  type ProjectSummary,
} from "@/components/configurator/ProjectListRow";
import { getProductionTemplateOptions } from "@/lib/template-options";
import type { GameProjectManifest, GameTemplateId } from "@mashedgames/shared";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getProjectsStoragePathLabel } from "@/lib/workspace-ui-copy";
import { useWorkspaceSessionStore } from "@/lib/workspace-session-store";

export default function ConfiguratorProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [parentTemplateId, setParentTemplateId] = useState<GameTemplateId>("");

  const templateOptions = getProductionTemplateOptions();

  useEffect(() => {
    if (!parentTemplateId && templateOptions[0]) {
      setParentTemplateId(templateOptions[0].id);
    }
  }, [parentTemplateId, templateOptions]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/projects?mode=configurator");
      const data = (await response.json()) as {
        ok?: boolean;
        projects?: ProjectSummary[];
      };
      if (data.ok && data.projects) {
        setProjects(
          data.projects.filter(
            (p): p is ProjectSummary => "displayName" in p && !("error" in p),
          ),
        );
      }
    } catch {
      setError("Could not load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const createProject = async () => {
    if (!displayName.trim() || !parentTemplateId) {
      setError("Name and template are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, parentTemplateId }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        projectId?: string;
      };
      if (!response.ok || !data.ok || !data.projectId) {
        throw new Error(data.error ?? "Create failed.");
      }
      router.push(`/configurator?project=${data.projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const handleProjectUpdated = useCallback((manifest: GameProjectManifest) => {
    setProjects((current) =>
      current.map((project) =>
        project.projectId === manifest.projectId
          ? { ...project, displayName: manifest.displayName }
          : project,
      ),
    );
  }, []);

  const handleProjectDeleted = useCallback((projectId: string) => {
    const { activeConfiguratorProjectId, clearConfiguratorSession } =
      useWorkspaceSessionStore.getState();
    if (activeConfiguratorProjectId === projectId) {
      clearConfiguratorSession();
    }
    setProjects((current) =>
      current.filter((project) => project.projectId !== projectId),
    );
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <header>
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-800">
          ← Home
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
          Configurator projects
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Create a client build from a production template, or open an existing
          project from{" "}
          <code className="text-xs">{getProjectsStoragePathLabel()}</code>.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Plus className="h-4 w-4" />
          New project
        </h2>
        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="text-zinc-700">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Acme Summer Catch"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-700">Parent template</span>
            <select
              value={parentTemplateId}
              onChange={(e) => setParentTemplateId(e.target.value as GameTemplateId)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              {templateOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={creating}
            onClick={() => void createProject()}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create project
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-900">Open existing</h2>
        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </p>
        ) : projects.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No projects yet. Create one above — saved under{" "}
            <code className="text-xs">{getProjectsStoragePathLabel()}</code>.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {projects.map((project) => (
              <ProjectListRow
                key={project.projectId}
                project={project}
                onUpdated={handleProjectUpdated}
                onDeleted={handleProjectDeleted}
              />
            ))}
          </ul>
        )}
      </section>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
