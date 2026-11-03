import { z } from "zod";
import { summaryFacts, windowFor } from "@/features/dashboard";
import { getFamilyDashboard } from "@/features/dashboard/server";
import { assertRole } from "@/features/family/server";
import { isGuideConfigured, writeFamilySummary } from "@/features/guide/server";
import { json, withApi } from "@/lib/api";

const querySchema = z.object({
  days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])),
});

/**
 * For the phone: Jarso's sentence or two about the family over the period, as the web dashboard
 * shows (Claude, so not a direct read). `{ text: null }` whenever there is none: the guide off,
 * no family, or a summary that couldn't be written or failed its check.
 */
export const GET = withApi(
  async (request: Request) => {
    await assertRole("parent");
    const { days } = querySchema.parse({
      days: new URL(request.url).searchParams.get("days") ?? undefined,
    });
    if (!isGuideConfigured()) return json({ text: null });
    const data = await getFamilyDashboard(days);
    if (!data) return json({ text: null });
    const facts = summaryFacts(
      data.children,
      windowFor(days, data.today),
      data.currency,
      data.today,
    );
    return json({ text: await writeFamilySummary(facts) });
  },
  { bearer: true },
);
