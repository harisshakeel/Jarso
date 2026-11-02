import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { guideDailyBudgetCents, guideMonthlyBudgetCents } from "./config";
import { usageCents } from "./cost";
import { usageSince } from "./repository";

async function spentCentsSince(since: string): Promise<number> {
  const rows = await usageSince(createAdminClient(), since);
  return rows.reduce((sum, row) => sum + usageCents(row.usage, row.model), 0);
}

/** Whether today's or this month's spend on Jarso (UTC) has reached its cap. */
export async function budgetSpent(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const [day, month] = await Promise.all([
    spentCentsSince(`${today}T00:00:00Z`),
    spentCentsSince(`${today.slice(0, 7)}-01T00:00:00Z`),
  ]);
  return day >= guideDailyBudgetCents() || month >= guideMonthlyBudgetCents();
}
