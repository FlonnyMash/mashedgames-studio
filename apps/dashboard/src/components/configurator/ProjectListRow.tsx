"use client";

import { ProjectDetailsDialog } from "@/components/configurator/ProjectDetailsDialog";
import { TemplateThumbnail } from "@/components/studio/TemplateListRow";
import type { GameProjectManifest } from "@mashedgames/shared";
import { MoreVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type ProjectSummary = {
  projectId: string;
  displayName: string;
  parentTemplateId: string;
  parentVersion: string;
  /** Inherited from the parent template's meta — read-only, never saved to project files */
  thumbnailUrl?: string;
};

export function ProjectListRow({
  project,
  onUpdated,
  onDeleted,
}: {
  project: ProjectSummary;
  onUpdated?: (manifest: GameProjectManifest) => void;
  onDeleted?: (projectId: string) => void;
}) {
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [displayName, setDisplayName] = useState(project.displayName);

  const openProject = () => {
    router.push(
      `/configurator?project=${encodeURIComponent(project.projectId)}`,
    );
  };

  const applyManifest = (manifest: GameProjectManifest) => {
    setDisplayName(manifest.displayName);
    onUpdated?.(manifest);
  };

  useEffect(() => {
    setDisplayName(project.displayName);
  }, [project.displayName]);

  return (
    <>
      <div className="group relative flex flex-col overflow-hidden rounded-md border border-zinc-100 bg-white transition-colors hover:border-zinc-200">
        <button
          type="button"
          onClick={openProject}
          className="flex flex-1 flex-col text-left"
        >
          <TemplateThumbnail
            variant="card"
            src={project.thumbnailUrl}
            alt={displayName}
          />

          <div className="flex flex-1 flex-col gap-2.5 p-4">
            <span className="text-sm font-semibold tracking-tight text-zinc-900">
              {displayName}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-sm bg-zinc-100 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                {project.projectId}
              </span>
              <span className="rounded-sm bg-zinc-100 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                v{project.parentVersion}
              </span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDetailsOpen(true);
          }}
          className="absolute right-2 top-2 rounded-md bg-white/90 p-1.5 text-zinc-400 opacity-100 backdrop-blur-sm transition-all hover:bg-white hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus:opacity-100"
          aria-label={`${displayName} details`}
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <ProjectDetailsDialog
        projectId={project.projectId}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onSaved={applyManifest}
        onDeleted={onDeleted}
      />
    </>
  );
}
