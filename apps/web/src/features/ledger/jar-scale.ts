import { minorDigits } from "@/lib";

/**
 * One shared scale for both jars when there is no goal, so Spend and Save compare honestly:
 * the larger balance, four allowances, or 20 major units of the family's currency.
 */
export function jarCapacity(input: {
  spendMinor: number;
  saveMinor: number;
  allowanceMinor: number | null;
  currency: string;
}): number {
  const floor = 20 * 10 ** minorDigits(input.currency);
  return Math.max(input.spendMinor, input.saveMinor, 4 * (input.allowanceMinor ?? 0), floor);
}
