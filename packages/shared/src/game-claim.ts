import { z } from "zod";

export const GameClaimSchema = z
  .object({
    targetOwnerId: z.string().uuid(),
    slug: z.string().min(3).max(100),
    temporaryConfigId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.temporaryConfigId || data.templateId), {
    message: "Either temporaryConfigId or templateId must be provided.",
  });

export type GameClaim = z.infer<typeof GameClaimSchema>;

export function parseGameClaim(input: unknown): GameClaim {
  return GameClaimSchema.parse(input);
}
