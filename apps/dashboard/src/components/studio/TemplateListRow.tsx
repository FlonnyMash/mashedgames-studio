"use client";

import { TemplateDetailsDialog } from "@/components/studio/TemplateDetailsDialog";
import { richTextToPlainText } from "@/lib/rich-html-content";
import type { TemplateOverview } from "@/lib/template-overview-types";
import { ImageIcon, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Shared thumbnail placeholder — used here and exported for ProjectListRow
// ---------------------------------------------------------------------------

export function TemplateThumbnail({
  src,
  alt,
  variant = "inline",
}: {
  src: string | undefined;
  alt: string;
  variant?: "inline" | "card";
}) {
  const [errored, setErrored] = useState(false);

  const wrapperClassName =
    variant === "card"
      ? "relative aspect-video w-full overflow-hidden rounded-t-md bg-zinc-900"
      : "relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-900";

  return (
    <div className={wrapperClassName}>
      {src && !errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="h-5 w-5 text-zinc-600" aria-hidden />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template list row
// ---------------------------------------------------------------------------

export function TemplateListRow({
  template,
  onUpdated,
  onDeleted,
}: {
  template: TemplateOverview;
  onUpdated?: () => void;
  onDeleted?: (templateId: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <li className="group relative">
        <div className="flex items-center gap-2 pr-2">
          <Link
            href={`/studio?template=${encodeURIComponent(template.id)}`}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50"
          >
            {/* 16:9 thumbnail */}
            <TemplateThumbnail
              src={template.thumbnailUrl}
              alt={template.displayName}
            />

            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900">{template.displayName}</p>
              <p className="text-xs text-zinc-500">{template.id}</p>
              {template.description ? (
                <p className="mt-0.5 truncate text-xs text-zinc-400">
                  {richTextToPlainText(template.description, 120)}
                </p>
              ) : null}
            </div>
          </Link>

          {/* Three-dots menu */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDetailsOpen(true);
            }}
            className="shrink-0 rounded-lg p-2 text-zinc-400 opacity-100 transition-all hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus:opacity-100"
            aria-label={`${template.displayName} details`}
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </li>

      <TemplateDetailsDialog
        templateId={template.id}
        templateLabel={template.displayName}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onDeleted={(deletedId) => {
          setDetailsOpen(false);
          onDeleted?.(deletedId);
          onUpdated?.();
        }}
      />
    </>
  );
}
