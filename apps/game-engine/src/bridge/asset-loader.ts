import {
  isProjectRelativeAssetPath,
  isStudioAssetUrl,
  resolveStudioAssetUrl,
  STUDIO_PROTOCOL,
} from "@mashedgames/shared";

export type ResolveTextureContext = {
  projectId?: string;
  runtimeAssets?: Record<string, string>;
};

export function getStudioAssetUrl(
  relativePath: string,
  projectId: string,
): string {
  return resolveStudioAssetUrl(relativePath, projectId);
}

export function withCacheBust(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${Date.now()}`;
}

/** Demo bundles host assets at /game-assets/ while the engine iframe is under /engine/. */
export function normalizeDeployAssetUrl(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("./game-assets/")) {
    return normalized.slice(1);
  }
  if (normalized.startsWith("../game-assets/")) {
    return normalized.slice(2);
  }
  return normalized;
}

export { isStudioAssetUrl, isProjectRelativeAssetPath, STUDIO_PROTOCOL };

export function isProjectRelativeAsset(src: string): boolean {
  return isProjectRelativeAssetPath(src);
}

export function canUseStudioProtocol(context: {
  projectId?: string;
}): boolean {
  return Boolean(context.projectId);
}

export function isExternalAsset(
  src: string,
  context?: ResolveTextureContext,
): boolean {
  if (!src || src.startsWith("data:")) return false;
  if (isStudioAssetUrl(src)) return true;
  if (!isProjectRelativeAsset(src)) return false;
  if (canUseStudioProtocol(context ?? {})) return true;
  const rel = src.replace(/^\//, "");
  return Boolean(context?.runtimeAssets?.[rel]);
}

export function resolveTextureUrl(
  src: string,
  context?: ResolveTextureContext | Record<string, string>,
): string {
  if (!src || src.startsWith("data:")) {
    return "";
  }

  const ctx: ResolveTextureContext =
    context && "projectId" in context
      ? context
      : { runtimeAssets: context as Record<string, string> | undefined };

  if (isStudioAssetUrl(src)) {
    return withCacheBust(src);
  }

  const rel = src.replace(/^\//, "");

  if (isProjectRelativeAsset(src) && ctx.projectId) {
    return withCacheBust(getStudioAssetUrl(rel, ctx.projectId));
  }

  if (isProjectRelativeAsset(src) && ctx.runtimeAssets?.[rel]) {
    const mapped = ctx.runtimeAssets[rel];
    if (
      mapped.startsWith("http://") ||
      mapped.startsWith("https://") ||
      mapped.startsWith("/") ||
      mapped.startsWith("./") ||
      mapped.startsWith("../")
    ) {
      return withCacheBust(normalizeDeployAssetUrl(mapped));
    }
  }

  if (src.startsWith("http://") || src.startsWith("https://")) {
    return src;
  }

  if (src.startsWith("/") || src.startsWith("./") || src.startsWith("../")) {
    return withCacheBust(src);
  }

  return "";
}
