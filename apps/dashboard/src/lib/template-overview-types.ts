export type TemplateManifestStatus = "published" | "draft";

export type TemplateOverview = {
  id: string;
  displayName: string;
  status: TemplateManifestStatus;
  /** Short marketing description from meta/template-meta.json */
  description?: string;
  /** URL path served by /api/templates/[id]/meta/asset for the thumbnail */
  thumbnailUrl?: string;
  /** URL paths served by /api/templates/[id]/meta/asset for each preview */
  previewUrls?: string[];
  /** Markdown tutorial string from meta/template-meta.json */
  tutorial?: string;
};

export type TemplateOverviewEntry = TemplateOverview;
