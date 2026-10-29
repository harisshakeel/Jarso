import { z } from "zod";
import { countryCodes, genderOptions } from "@/config";
import { EARLIEST_BIRTH_DATE, isAdultBirthDate } from "./age";

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(100),
  avatarUrl: z.url().nullish(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** A parent's own details (ADR 0008). The database re-checks every rule. */
export const parentDetailsSchema = z.object({
  dateOfBirth: z.iso
    .date({ error: "Enter your date of birth" })
    .refine((value) => value >= EARLIEST_BIRTH_DATE, "Check the year you were born")
    .refine((value) => isAdultBirthDate(value), "You need to be 18 or over"),
  country: z.enum(countryCodes, { error: "Choose your country" }),
  gender: z.enum(genderOptions, { error: "Choose an option" }),
});

export type ParentDetailsInput = z.infer<typeof parentDetailsSchema>;
