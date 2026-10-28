export type Membership = { familyId: string; role: "parent" | "child"; status: "approved" };
export type Family = { id: string; code: string; currency: string; timezone: string };
export type ChildSummary = { id: string; nickname: string };
