import { balanceHistory, type JarMovement, type Jars, jarChange } from "@jarso/core/ledger";
import { addDays } from "@jarso/core/lib";
import type { JarsoMoment } from "@jarso/core/mascot";

/**
 * The one line Jarso says at the top of Home: how the jars moved over the last 7 days, in at
 * most 8 words. Praise only when Save went up; never a judgement of an amount.
 */
export function heroLine(input: {
  jars: Jars;
  movements: JarMovement[] | null;
  today: string;
  money: (minor: number) => string;
}): { text: string; moment: JarsoMoment } {
  const { jars, movements, today, money } = input;
  if (movements === null) return { text: "Good to see you!", moment: "greeting" };
  if (jars.spend === 0 && jars.save === 0 && movements.length === 0) {
    return { text: "Your pocket money will land here.", moment: "empty" };
  }
  const { points } = balanceHistory(jars, movements, addDays(today, -6), today);
  const change = jarChange(points);
  if (change.save > 0) {
    return { text: `${money(change.save)} saved this week. Nice!`, moment: "saved" };
  }
  if (change.save < 0) {
    return { text: `Save dipped ${money(-change.save)} this week.`, moment: "rest" };
  }
  if (change.spend !== 0) {
    const way = change.spend > 0 ? "climbed" : "dipped";
    return { text: `Spend ${way} ${money(Math.abs(change.spend))} this week.`, moment: "rest" };
  }
  return { text: "Both jars stayed put this week.", moment: "rest" };
}
