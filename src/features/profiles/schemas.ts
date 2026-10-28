import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(100),
  avatarUrl: z.url().nullish(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
