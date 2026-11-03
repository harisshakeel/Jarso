import { createTimedFetch } from "@jarso/core/lib";

/** The web's Supabase fetch: 8 s deadline; a timeout or network failure becomes JA503. */
export const supabaseFetch = createTimedFetch({ timeoutMs: 8000, name: "supabase" });
