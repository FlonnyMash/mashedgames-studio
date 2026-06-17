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
      <li className="group relative">
        <div className="flex items-center gap-2 pr-2">
          <button
            type="button"
            onClick={openProject}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-zinc-50"
          >
            {/* 16:9 thumbnail inherited from parent template */}
            <TemplateThumbnail
              src={project.thumbnailUrl}
              alt={displayName}
            />

            <span className="min-w-0 flex-1">
              <span className="block font-medium text-zinc-900">
                {displayName}
              </span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                {project.parentTemplateId} · v{project.parentVersion}
              </span>
            </span>

            <span className="ml-4 shrink-0 font-mono text-xs text-zinc-400">
              {project.projectId}
            </span>
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDetailsOpen(true);
            }}
            className="shrink-0 rounded-lg p-2 text-zinc-400 opacity-100 transition-all hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus:opacity-100"
            aria-label={`${displayName} details`}
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </li>

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
