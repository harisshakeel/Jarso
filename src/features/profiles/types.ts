import type { CountryCode, Gender } from "@/config";
import type { Tables } from "@/types";

export type ProfileRow = Tables<"profiles">;

/** Domain shape exposed to UI and API — decoupled from DB column names. */
export type Profile = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

/** A parent's own details (ADR 0008). Only the owner can read them. Dates are ISO. */
export type ParentDetails = {
  dateOfBirth: string;
  country: CountryCode;
  gender: Gender;
  completedAt: string;
};
