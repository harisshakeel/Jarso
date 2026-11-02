import { JarIllustration } from "@/components/jar";
import { Card, CardContent } from "@/components/ui";
import { formatMoney } from "@/lib";
import { jarCapacity } from "../jar-scale";
import type { Jars as JarBalances } from "../types";

type JarsProps = {
  jars: JarBalances;
  currency: string;
  /** Parents see exact amounts ("always"); the child sees "₹500" for whole amounts. */
  showMinor?: "always" | "nonzero";
  /** The running allowance, so the shared scale matches the child's Home. */
  allowanceMinor?: number | null;
};

/** The child's two jars as jars, not tiles: confirmed money only, each amount written beside it. */
export function Jars({ jars, currency, showMinor = "nonzero", allowanceMinor = null }: JarsProps) {
  const capacity = jarCapacity({
    spendMinor: jars.spend,
    saveMinor: jars.save,
    allowanceMinor,
    currency,
  });
  const money = (minor: number) => formatMoney(minor, currency, { showMinor });
  return (
    <Card className="shadow-raised">
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <section aria-label="Spend jar" className="grid justify-items-center gap-2 text-center">
            <JarIllustration
              jar="spend"
              size="sm"
              capacityMinor={capacity}
              filledMinor={jars.spend}
            />
            <h2 className="font-semibold text-ink-2">Spend</h2>
            <p className="money font-extrabold text-money-l">{money(jars.spend)}</p>
          </section>
          <section aria-label="Save jar" className="grid justify-items-center gap-2 text-center">
            <JarIllustration
              jar="save"
              size="sm"
              capacityMinor={capacity}
              filledMinor={jars.save}
            />
            <h2 className="font-semibold text-ink-2">Save</h2>
            <p className="money font-extrabold text-money-l">{money(jars.save)}</p>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
