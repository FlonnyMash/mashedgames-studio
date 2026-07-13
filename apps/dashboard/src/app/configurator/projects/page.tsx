"use client";

import {
  ProjectListRow,
  type ProjectSummary,
} from "@/components/configurator/ProjectListRow";
import { ParentTemplateDropdown } from "@/components/configurator/ParentTemplateDropdown";
import type { TemplateOverviewEntry } from "@/lib/template-overview-types";
import type { GameProjectManifest, GameTemplateId } from "@mashedgames/shared";
import { Loader2, Plus, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createProjectViaApi, projectFetch } from "@/lib/project-api-client";
import { getProjectsStoragePathLabel } from "@/lib/workspace-ui-copy";
import { useWorkspaceSessionStore } from "@/lib/workspace-session-store";

const CLIENT_LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";
const MAX_CLIENT_LOGO_BYTES = 4 * 1024 * 1024;

export default function ConfiguratorProjectsPage() {
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientLogoFile, setClientLogoFile] = useState<File | null>(null);
  const [parentTemplateId, setParentTemplateId] = useState<GameTemplateId>("");
  const [libraryTemplates, setLibraryTemplates] = useState<
    TemplateOverviewEntry[] | null
  >(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const publishedTemplates = useMemo(
    () =>
      libraryTemplates?.filter((template) => template.status === "published") ??
      [],
    [libraryTemplates],
  );

  useEffect(() => {
    if (!isCreateModalOpen) return;

    let cancelled = false;
    setTemplatesLoading(true);

    void fetch("/api/templates")
      .then(async (response) => {
        const data = (await response.json()) as {
          ok?: boolean;
          templates?: TemplateOverviewEntry[];
        };
        if (!response.ok || !data.ok || !data.templates) {
          throw new Error("Could not load templates.");
        }
        return data.templates;
      })
      .then((templates) => {
        if (!cancelled) {
          setLibraryTemplates(templates);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLibraryTemplates([]);
          setError("Could not load template library.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isCreateModalOpen]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await projectFetch("/api/projects?mode=configurator");
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

  const resetCreateForm = useCallback(() => {
    setDisplayName("");
    setClientName("");
    setClientLogoFile(null);
    setParentTemplateId("");
    setLibraryTemplates(null);
    setTemplatesLoading(false);
    setError(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  }, []);

  const closeCreateModal = useCallback(() => {
    if (creating) return;
    setIsCreateModalOpen(false);
    resetCreateForm();
  }, [creating, resetCreateForm]);

  const handleClientLogoSelected = useCallback((file: File | undefined) => {
    if (!file) return;

    if (file.size > MAX_CLIENT_LOGO_BYTES) {
      setError("Client logo must be 4 MB or smaller.");
      setClientLogoFile(null);
      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
      return;
    }

    setError(null);
    setClientLogoFile(file);
  }, []);

  const createProject = async () => {
    if (!displayName.trim() || !parentTemplateId) {
      setError("Name and template are required.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const data = await createProjectViaApi({
        displayName: displayName.trim(),
        parentTemplateId,
        clientName: clientName.trim() || undefined,
        clientLogo: clientLogoFile ?? undefined,
      });
      if (!data.ok || !data.projectId) {
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
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10">
      <header className="max-w-3xl">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800"
        >
          ← Home
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight leading-tight text-zinc-900">
          Configurator projects
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Create a client build from a production template, or open an existing
          project from{" "}
          <code className="rounded border border-zinc-200/50 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-600">
            {getProjectsStoragePathLabel()}
          </code>
          .
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            resetCreateForm();
            setIsCreateModalOpen(true);
          }}
          className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-zinc-200 bg-zinc-50/40 p-6 text-center transition-colors hover:border-zinc-800 hover:bg-zinc-50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white">
            <Plus className="h-5 w-5 text-zinc-700" strokeWidth={1.5} />
          </span>
          <span className="text-sm font-medium tracking-tight text-zinc-900">
            Create New Project
          </span>
          <span className="text-xs text-zinc-500">
            From a licensed production template
          </span>
        </button>

        {loading ? (
          <div className="col-span-full flex items-center justify-center py-16">
            <p className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading projects…
            </p>
          </div>
        ) : (
          projects.map((project) => (
            <ProjectListRow
              key={project.projectId}
              project={project}
              onUpdated={handleProjectUpdated}
              onDeleted={handleProjectDeleted}
            />
          ))
        )}
      </div>

      {!loading && projects.length === 0 && !error ? (
        <p className="text-center text-sm text-zinc-400">
          No projects yet — use the card above to get started.
        </p>
      ) : null}

      {error && !isCreateModalOpen ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {isCreateModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
        >
          <button
            type="button"
            aria-label="Close create project dialog"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeCreateModal}
          />
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="create-project-title"
                  className="text-lg font-semibold tracking-tight text-zinc-900"
                >
                  New project
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Configure a client build from a parent template.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <label className="block">
                <span className="text-sm font-medium text-zinc-700">
                  Display name
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Acme Summer Catch"
                  autoFocus
                  className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900/5"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-zinc-700">
                  Client name
                </span>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Acme Corp"
                  className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900/5"
                />
              </label>

              <div className="block">
                <span className="text-sm font-medium text-zinc-700">
                  Client logo
                </span>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={creating}
                  className="mt-1.5 flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-8 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white">
                    <Upload className="h-4 w-4 text-zinc-600" strokeWidth={1.5} />
                  </span>
                  {clientLogoFile ? (
                    <>
                      <span className="text-sm font-medium tracking-tight text-zinc-900">
                        {clientLogoFile.name}
                      </span>
                      <span className="text-xs text-zinc-500">
                        Click to replace
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium tracking-tight text-zinc-700">
                        Upload client logo
                      </span>
                      <span className="text-xs text-zinc-400">
                        PNG · JPG · WEBP · SVG · GIF · max 4 MB
                      </span>
                    </>
                  )}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept={CLIENT_LOGO_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    handleClientLogoSelected(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="block">
                <span className="text-sm font-medium text-zinc-700">
                  Parent template
                </span>
                <div className="mt-1.5">
                  <ParentTemplateDropdown
                    templates={publishedTemplates}
                    loading={templatesLoading}
                    selectedTemplateId={parentTemplateId}
                    onSelectTemplate={setParentTemplateId}
                    disabled={creating}
                  />
                </div>
              </div>

              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creating}
                  className="rounded-md px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={creating || !parentTemplateId}
                  onClick={() => void createProject()}
                  className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-zinc-800 disabled:opacity-60"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Create project
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
