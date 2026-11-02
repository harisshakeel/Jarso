/** Narrow, client-safe view of the signed-in user. Never expose raw JWT claims. */
export type SessionUser = {
  id: string;
  email: string | null;
};
