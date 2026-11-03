import { whereItWent, whereItWentCopy } from "@jarso/core/ledger";
import type { FamilyContext } from "@jarso/data/family";
import { getHistorySince } from "@jarso/data/ledger";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/screen";
import { Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { startOfWeek } from "@/lib";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/**
 * This week's spending by category and money in, as sentences (the web's card). No chart, no
 * table. Nice to have: hidden if this week's lines can't load. With `childId` it is a parent
 * reading that child's week, with exact amounts as on the web's parent page.
 */
export function WhereItWentCard({
  context,
  childId,
}: {
  context: FamilyContext;
  childId?: string;
}) {
  const { userId } = useSession();
  const whose = childId ?? userId;
  const week = useQuery({
    queryKey: childId ? keys.childWeek(childId) : keys.week(userId ?? ""),
    enabled: Boolean(whose),
    queryFn: () =>
      getHistorySince(supabase, whose as string, startOfWeek(context.today), {
        timezone: context.timezone,
        now: Date.now(),
      }),
  });
  if (!week.data) return null;
  const view = whereItWent(week.data, context.today, context.currency, {
    showMinor: childId ? "always" : "nonzero",
  });
  return (
    <Card accessibilityLabel={whereItWentCopy.heading} className="gap-2">
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {whereItWentCopy.heading}
      </Text>
      {view.spent ? (
        <>
          <Text className="font-sans-bold">{view.spent.headline}</Text>
          {view.spent.rest.map((line) => (
            <Text key={line}>{line}</Text>
          ))}
        </>
      ) : (
        <Text className="font-sans-bold">{view.empty}</Text>
      )}
      {view.moneyIn ? <Text className="text-muted-foreground">{view.moneyIn}</Text> : null}
    </Card>
  );
}
