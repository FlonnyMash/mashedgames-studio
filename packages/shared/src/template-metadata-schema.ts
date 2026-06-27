import { z } from "zod";

// ---------------------------------------------------------------------------
// Badge type enum + contrast-safe Tailwind config (JIT-safe static literals)
// ---------------------------------------------------------------------------

export const BADGE_TYPES = ["NEW", "POPULAR", "HOT"] as const;

export const BadgeTypeSchema = z.enum(BADGE_TYPES);
export type BadgeType = z.infer<typeof BadgeTypeSchema>;

export type BadgeStyle = {
  label: string;
  ribbonClass: string;
};

export const BADGE_CONFIG: Record<BadgeType, BadgeStyle> = {
  NEW: {
    label: "New",
    ribbonClass: "border-0 bg-yellow-400 text-yellow-950",
  },
  POPULAR: {
    label: "Popular",
    ribbonClass: "border-0 bg-orange-500 text-white",
  },
  HOT: {
    label: "Hot",
    ribbonClass: "border-0 bg-amber-400 text-amber-950",
  },
};

const BADGE_TYPE_SET = new Set<string>(BADGE_TYPES);

export function isBadgeType(value: string): value is BadgeType {
  return BADGE_TYPE_SET.has(value);
}

export function getBadgeStyle(badgeType: BadgeType | string | null | undefined): BadgeStyle | null {
  if (badgeType == null) return null;
  if (isBadgeType(badgeType)) {
    return BADGE_CONFIG[badgeType];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Metadata domain schemas
// ---------------------------------------------------------------------------

const optionalUrlOrEmpty = z
  .string()
  .max(2048)
  .refine((v) => v === "" || z.string().url().safeParse(v).success, {
    message: "Must be a valid URL or empty string.",
  });

export const TemplateMetadataSchema = z.object({
  templateSlug: z.string().min(1).max(100),
  title: z.string().max(200).default(""),
  description: z.string().max(5000).default(""),
  badgeType: BadgeTypeSchema.nullable().default(null),
  tutorial: z.string().max(50000).default(""),
  thumbnailUrl: optionalUrlOrEmpty.default(""),
  previewUrls: z.array(z.string().url()).default([]),
  tagIds: z.array(z.string().uuid()).default([]),
});

export type TemplateMetadata = z.infer<typeof TemplateMetadataSchema>;

export const UpdateTemplateMetadataInputSchema = TemplateMetadataSchema.omit({
  templateSlug: true,
});

export type UpdateTemplateMetadataInput = z.infer<
  typeof UpdateTemplateMetadataInputSchema
>;

// ---------------------------------------------------------------------------
// DB row schemas (snake_case)
// ---------------------------------------------------------------------------

export const TemplateMetadataRowSchema = z.object({
  template_slug: z.string(),
  title: z.string(),
  description: z.string(),
  badge_type: BadgeTypeSchema.nullable(),
  tutorial: z.string(),
  thumbnail_url: z.string(),
  preview_urls: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TemplateMetadataRow = z.infer<typeof TemplateMetadataRowSchema>;

export function templateMetadataFromRow(row: TemplateMetadataRow): TemplateMetadata {
  return {
    templateSlug: row.template_slug,
    title: row.title,
    description: row.description,
    badgeType: row.badge_type,
    tutorial: row.tutorial,
    thumbnailUrl: row.thumbnail_url,
    previewUrls: row.preview_urls,
    tagIds: [],
  };
}

export function parseUpdateTemplateMetadataInput(input: unknown): UpdateTemplateMetadataInput {
  return UpdateTemplateMetadataInputSchema.parse(input);
}

export function parseTemplateMetadataRow(input: unknown): TemplateMetadataRow {
  return TemplateMetadataRowSchema.parse(input);
}
