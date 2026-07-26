"use client";

import { create } from "state";
import type { ProjectSummary } from "@/components/configurator/ProjectListRow";
import { projectFetch } from "@/lib/project-api-client";

type ProjectsListStore = {
  projects: ProjectSummary[];
  hasLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  inFlight: Promise<ProjectSummary[]> | null;

  loadProjects: (options?: { force?: boolean }) => Promise<ProjectSummary[]>;
  prefetch: () => void;
  upsertLocal: (project: ProjectSummary) => void;
  removeLocal: (projectId: string) => void;
  patchDisplayName: (projectId: string, displayName: string) => void;
  reset: () => void;
};

async function fetchConfiguratorProjects(): Promise<ProjectSummary[]> {
  const response = await projectFetch("/api/projects?mode=configurator");
  const data = (await response.json()) as {
    ok?: boolean;
    projects?: Array<ProjectSummary | { projectId: string; error: string }>;
    error?: string;
  };

  if (!response.ok || !data.ok || !data.projects) {
    throw new Error(data.error ?? "Could not load projects.");
  }

  return data.projects.filter(
    (p): p is ProjectSummary => "displayName" in p && !("error" in p),
  );
}

export const useProjectsListStore = create<ProjectsListStore>((set, get) => ({
  projects: [],
  hasLoaded: false,
  isLoading: false,
  error: null,
  inFlight: null,

  loadProjects: async (options = {}) => {
    const state = get();
    if (!options.force && state.hasLoaded) {
      if (!state.inFlight) {
        const refresh = fetchConfiguratorProjects()
          .then((projects) => {
            set({
              projects,
              hasLoaded: true,
              isLoading: false,
              error: null,
              inFlight: null,
            });
            return projects;
          })
          .catch(() => {
            set({ inFlight: null, isLoading: false });
            return get().projects;
          });
        set({ inFlight: refresh });
      }
      return state.projects;
    }

    if (state.inFlight) {
      return state.inFlight;
    }

    set({
      isLoading: !state.hasLoaded,
      error: null,
    });

    const request = fetchConfiguratorProjects()
      .then((projects) => {
        set({
          projects,
          hasLoaded: true,
          isLoading: false,
          error: null,
          inFlight: null,
        });
        return projects;
      })
      .catch((err) => {
        set({
          isLoading: false,
          inFlight: null,
          error:
            err instanceof Error ? err.message : "Could not load projects.",
        });
        throw err;
      });

    set({ inFlight: request });
    return request;
  },

  prefetch: () => {
    void get().loadProjects().catch(() => {
      // Prefetch failures are non-fatal.
    });
  },

  upsertLocal: (project) => {
    set((s) => {
      const exists = s.projects.some((p) => p.projectId === project.projectId);
      return {
        projects: exists
          ? s.projects.map((p) =>
              p.projectId === project.projectId ? project : p,
            )
          : [project, ...s.projects],
        hasLoaded: true,
      };
    });
  },

  removeLocal: (projectId) => {
    set((s) => ({
      projects: s.projects.filter((p) => p.projectId !== projectId),
    }));
  },

  patchDisplayName: (projectId, displayName) => {
    set((s) => ({
      projects: s.projects.map((p) =>
        p.projectId === projectId ? { ...p, displayName } : p,
      ),
    }));
  },

  reset: () =>
    set({
      projects: [],
      hasLoaded: false,
      isLoading: false,
      error: null,
      inFlight: null,
    }),
}));
