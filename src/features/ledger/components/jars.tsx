import { Card, CardContent } from "@/components/ui";
import { formatMoney } from "@/lib";
import type { Jars as JarBalances } from "../types";

type JarsProps = {
  jars: JarBalances;
  currency: string;
  /** Parents see exact amounts ("always"); the child sees "₹500" for whole amounts. */
  showMinor?: "always" | "nonzero";
};

const items = [
  { key: "spend", label: "Spend", name: "Spend jar" },
  { key: "save", label: "Save", name: "Save jar" },
] as const;

/** The child's two jars: confirmed money only. */
export function Jars({ jars, currency, showMinor = "nonzero" }: JarsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {items.map((item) => (
        <Card key={item.key} className="shadow-raised">
          <CardContent>
            <section aria-label={item.name} className="grid gap-1">
              <h2 className="text-ink-2 text-sm">{item.label}</h2>
              <p className="money font-extrabold text-3xl">
                {formatMoney(jars[item.key], currency, { showMinor })}
              </p>
            </section>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
