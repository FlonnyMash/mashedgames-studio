import type { Tag } from "@mashedgames/shared";

/** Tag record enriched with parent category display fields (admin API responses). */
export type TagWithCategory = Tag & {
  categoryName: string;
  categorySlug: string;
};
