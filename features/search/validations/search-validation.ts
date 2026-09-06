import { z } from "zod";

import { SEARCH_FILTER_TYPES } from "../types";

const optionalUuid = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.uuid().optional(),
);

const optionalDate = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .trim()
    .max(40)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Enter a valid date.",
    })
    .optional(),
);

export const searchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(200),
    type: z.enum(SEARCH_FILTER_TYPES).default("all"),
    workspaceId: optionalUuid,
    channelId: optionalUuid,
    userId: optionalUuid,
    from: optionalDate,
    to: optionalDate,
    cursor: z.string().trim().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && new Date(value.from) > new Date(value.to)) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "The end date must be after the start date.",
      });
    }
  });

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export function parseSearchQuery(input: Record<string, string | undefined>) {
  return searchQuerySchema.safeParse(input);
}
