import { isProjectRelativeAssetPath, isStudioAssetUrl } from "./asset-reference";

export type AssetPreviewContext = {
  projectId?: string;
  templateId?: string;
};

/**
 * Builds a dashboard URL (or passthrough) for rendering an uploaded asset
 * thumbnail in the config panel.
 */
export function resolveAssetPreviewUrl(
  assetPath: string | undefined,
  ctx: AssetPreviewContext,
): string | null {
  if (!assetPath?.trim()) {
    return null;
  }

  const trimmed = assetPath.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    isStudioAssetUrl(trimmed)
  ) {
    return trimmed;
  }

  const relativePath = trimmed.replace(/^\//, "");
  if (!isProjectRelativeAssetPath(relativePath)) {
    return null;
  }

  const encodedPath = encodeURIComponent(relativePath);
  if (ctx.projectId) {
    return `/api/projects/${encodeURIComponent(ctx.projectId)}/asset?path=${encodedPath}`;
  }
  if (ctx.templateId) {
    return `/api/templates/${encodeURIComponent(ctx.templateId)}/asset?path=${encodedPath}`;
  }

  return null;
}
