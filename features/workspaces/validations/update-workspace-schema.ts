import { z } from "zod";

export const updateWorkspaceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Workspace name must be at least 2 characters.")
      .max(80, "Workspace name must be 80 characters or fewer.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(280, "Description must be 280 characters or fewer.")
      .nullable()
      .optional(),
    iconUrl: z
      .string()
      .trim()
      .url("Icon URL must be a valid URL.")
      .max(2048, "Icon URL is too long.")
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.iconUrl !== undefined,
    "Provide at least one workspace setting to update.",
  );

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
