import { z } from "zod";

// ---------------------------------------------------------------------------
// Slug primitives
// ---------------------------------------------------------------------------

export const TAG_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const TagSlugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(TAG_SLUG_REGEX, "Slug must be lowercase kebab-case.");

/** URL-safe slug from a human label. Mirrors slugifyProjectId conventions. */
export function slugifyTagName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (!slug) {
    return "tag";
  }
  if (/^[a-z]/.test(slug)) {
    return slug;
  }
  return `tag-${slug}`;
}

export function resolveTagSlug(name: string, explicit?: string): string {
  return explicit?.trim() ? TagSlugSchema.parse(explicit) : slugifyTagName(name);
}

// ---------------------------------------------------------------------------
// Tag category
// ---------------------------------------------------------------------------

export const TagCategorySchema = z.object({
  id: z.string().uuid(),
  slug: TagSlugSchema,
  name: z.string().min(1).max(80),
  description: z.string().max(500).default(""),
  sortOrder: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TagCategory = z.infer<typeof TagCategorySchema>;

export const CreateTagCategoryInputSchema = z.object({
  name: z.string().min(1).max(80),
  slug: TagSlugSchema.optional(),
  description: z.string().max(500).optional().default(""),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export type CreateTagCategoryInput = z.infer<typeof CreateTagCategoryInputSchema>;

export const UpdateTagCategoryInputSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  slug: TagSlugSchema.optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateTagCategoryInput = z.infer<typeof UpdateTagCategoryInputSchema>;

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

export const TagSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  slug: TagSlugSchema,
  name: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Tag = z.infer<typeof TagSchema>;

export const CreateTagInputSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(80),
  slug: TagSlugSchema.optional(),
});

export type CreateTagInput = z.infer<typeof CreateTagInputSchema>;

export const UpdateTagInputSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(80).optional(),
  slug: TagSlugSchema.optional(),
});

export type UpdateTagInput = z.infer<typeof UpdateTagInputSchema>;

// ---------------------------------------------------------------------------
// Template ↔ Tag (M:N)
// ---------------------------------------------------------------------------

export const TemplateTagSchema = z.object({
  templateSlug: z.string().min(1).max(100),
  tagId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type TemplateTag = z.infer<typeof TemplateTagSchema>;

export const SyncTemplateTagsInputSchema = z.object({
  templateSlug: z.string().min(1).max(100),
  tagIds: z.array(z.string().uuid()),
});

export type SyncTemplateTagsInput = z.infer<typeof SyncTemplateTagsInputSchema>;

// ---------------------------------------------------------------------------
// Storefront / catalog shapes
// ---------------------------------------------------------------------------

export const PublishedTagRefSchema = z.object({
  id: z.string().uuid(),
  slug: TagSlugSchema,
  name: z.string().min(1),
  categoryId: z.string().uuid(),
  categorySlug: TagSlugSchema,
  categoryName: z.string().min(1),
});

export type PublishedTagRef = z.infer<typeof PublishedTagRefSchema>;

export const PublishedTagUsageSchema = z.object({
  tagId: z.string().uuid(),
  tagSlug: TagSlugSchema,
  tagName: z.string().min(1),
  categoryId: z.string().uuid(),
  categorySlug: TagSlugSchema,
  categoryName: z.string().min(1),
  categorySortOrder: z.number().int(),
  usageCount: z.number().int().min(1),
});

export type PublishedTagUsage = z.infer<typeof PublishedTagUsageSchema>;

export const StorefrontTagFilterTagSchema = z.object({
  id: z.string().uuid(),
  slug: TagSlugSchema,
  name: z.string().min(1),
  usageCount: z.number().int().min(1),
});

export type StorefrontTagFilterTag = z.infer<typeof StorefrontTagFilterTagSchema>;

export const StorefrontTagFilterCategorySchema = z.object({
  id: z.string().uuid(),
  slug: TagSlugSchema,
  name: z.string().min(1),
  sortOrder: z.number().int(),
  tags: z.array(StorefrontTagFilterTagSchema),
});

export type StorefrontTagFilterCategory = z.infer<
  typeof StorefrontTagFilterCategorySchema
>;

export const PublishedTemplateWithTagsSchema = z.object({
  id: z.string().uuid(),
  templateSlug: z.string().min(1),
  version: z.string(),
  tier: z.enum(["free", "premium", "enterprise"]),
  manifest: z.record(z.string(), z.unknown()).default({}),
  storageKey: z.string(),
  checksum: z.string(),
  bundleSignature: z.string(),
  isLatest: z.boolean(),
  publishedAt: z.string().datetime(),
  yanked: z.boolean(),
  description: z.string().default(""),
  tutorial: z.string().default(""),
  thumbnailUrl: z.string().default(""),
  previewUrls: z.array(z.string()).default([]),
  tags: z.array(PublishedTagRefSchema).default([]),
  popularityScore: z.number().int().min(0).default(0),
});

export type PublishedTemplateWithTags = z.infer<
  typeof PublishedTemplateWithTagsSchema
>;

// ---------------------------------------------------------------------------
// DB row schemas (snake_case)
// ---------------------------------------------------------------------------

export const TagCategoryRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  sort_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TagCategoryRow = z.infer<typeof TagCategoryRowSchema>;

export const TagRowSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TagRow = z.infer<typeof TagRowSchema>;

export const TemplateTagRowSchema = z.object({
  template_slug: z.string(),
  tag_id: z.string().uuid(),
  created_at: z.string(),
});

export type TemplateTagRow = z.infer<typeof TemplateTagRowSchema>;

export const PublishedTagUsageRowSchema = z.object({
  tag_id: z.string().uuid(),
  tag_slug: z.string(),
  tag_name: z.string(),
  category_id: z.string().uuid(),
  category_slug: z.string(),
  category_name: z.string(),
  category_sort_order: z.number().int(),
  usage_count: z.number().int(),
});

export type PublishedTagUsageRow = z.infer<typeof PublishedTagUsageRowSchema>;

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

export function tagCategoryFromRow(row: TagCategoryRow): TagCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function tagFromRow(row: TagRow): Tag {
  return {
    id: row.id,
    categoryId: row.category_id,
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function templateTagFromRow(row: TemplateTagRow): TemplateTag {
  return {
    templateSlug: row.template_slug,
    tagId: row.tag_id,
    createdAt: row.created_at,
  };
}

export function publishedTagUsageFromRow(row: PublishedTagUsageRow): PublishedTagUsage {
  return {
    tagId: row.tag_id,
    tagSlug: row.tag_slug,
    tagName: row.tag_name,
    categoryId: row.category_id,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    categorySortOrder: row.category_sort_order,
    usageCount: row.usage_count,
  };
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

export function parseTagCategory(input: unknown): TagCategory {
  return TagCategorySchema.parse(input);
}

export function parseTag(input: unknown): Tag {
  return TagSchema.parse(input);
}

export function parseTemplateTag(input: unknown): TemplateTag {
  return TemplateTagSchema.parse(input);
}

export function parseTagCategoryRow(input: unknown): TagCategoryRow {
  return TagCategoryRowSchema.parse(input);
}

export function parseTagRow(input: unknown): TagRow {
  return TagRowSchema.parse(input);
}

export function parseTemplateTagRow(input: unknown): TemplateTagRow {
  return TemplateTagRowSchema.parse(input);
}

export function parsePublishedTagUsageRow(input: unknown): PublishedTagUsage {
  return publishedTagUsageFromRow(PublishedTagUsageRowSchema.parse(input));
}

export function parseStorefrontTagFilters(input: unknown): StorefrontTagFilterCategory[] {
  return z.array(StorefrontTagFilterCategorySchema).parse(input);
}

const StorefrontTagFilterCategoryRpcSchema = z.object({
  id: z.string().uuid(),
  slug: TagSlugSchema,
  name: z.string().min(1),
  sort_order: z.coerce.number().int(),
  tags: z.array(
    z.object({
      id: z.string().uuid(),
      slug: TagSlugSchema,
      name: z.string().min(1),
      usage_count: z.coerce.number().int().min(1),
    }),
  ),
});

/** Parses the snake_case payload from `get_storefront_tag_filters()` RPC. */
export function parseStorefrontTagFiltersFromRpc(
  input: unknown,
): StorefrontTagFilterCategory[] {
  if (input == null) {
    return [];
  }

  const result = z.array(StorefrontTagFilterCategoryRpcSchema).safeParse(input);
  if (!result.success) {
    return [];
  }

  return result.data.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
    tags: row.tags.map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      name: tag.name,
      usageCount: tag.usage_count,
    })),
  }));
}
