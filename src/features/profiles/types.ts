import type { Tables } from "@/types";

export type ProfileRow = Tables<"profiles">;

/** Domain shape exposed to UI and API — decoupled from DB column names. */
export type Profile = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};
