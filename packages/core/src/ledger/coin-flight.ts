import type { Jar } from "./types";

/** Where coins fly on the jar shelf: from one jar to the other, or out of a jar (a purchase). */
export type CoinFlight = { from: Jar; to: Jar | "out" };

/**
 * The flight a change in the balances calls for, or null. Money moving between the jars flies
 * jar to jar; money leaving Spend alone (a purchase) flies out. Money only arriving is the jar's
 * own coin drop; money only leaving Save (handed over as cash) gets no flight.
 */
export function flightFor(
  previous: { spend: number; save: number },
  next: { spend: number; save: number },
): CoinFlight | null {
  const spend = Math.sign(next.spend - previous.spend);
  const save = Math.sign(next.save - previous.save);
  if (save < 0 && spend > 0) return { from: "save", to: "spend" };
  if (spend < 0 && save > 0) return { from: "spend", to: "save" };
  if (spend < 0 && save === 0) return { from: "spend", to: "out" };
  return null;
}
