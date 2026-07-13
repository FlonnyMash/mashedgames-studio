export type TemplateManifestStatus = "published" | "draft";

export type TemplateOverview = {
  id: string;
  displayName: string;
  status: TemplateManifestStatus;
  version: string;
  /** Short marketing description from meta/template-meta.json */
  description?: string;
  /** Runtime engine label when declared on the template manifest */
  engineType?: string;
  /** Deployed / on-disk bundle size in kilobytes when known */
  deploymentSizeKb?: number;
  /** URL path served by /api/templates/[id]/meta/asset for the thumbnail */
  thumbnailUrl?: string;
  /** URL paths served by /api/templates/[id]/meta/asset for each preview */
  previewUrls?: string[];
  /** Markdown tutorial string from meta/template-meta.json */
  tutorial?: string;
};

export type TemplateOverviewEntry = TemplateOverview;
