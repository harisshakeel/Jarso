import type { WhereItWent } from "@jarso/core/ledger";
import { Card, CardContent } from "@/components/ui";

/** This week's spending by category and money in, as sentences. No chart, no table. */
export function WhereItWentCard({ view }: { view: WhereItWent }) {
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-label="Where your money went" className="grid gap-2">
          <h2 className="text-h3">Where your money went</h2>
          {view.spent ? (
            <>
              <p className="font-semibold">{view.spent.headline}</p>
              {view.spent.rest.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </>
          ) : (
            <p className="font-semibold">{view.empty}</p>
          )}
          {view.moneyIn ? <p className="text-ink-2">{view.moneyIn}</p> : null}
        </section>
      </CardContent>
    </Card>
  );
}
