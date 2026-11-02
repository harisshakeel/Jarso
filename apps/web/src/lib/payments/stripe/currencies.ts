// Stripe's minimum charge per currency, in minor units. Zero-decimal currencies (JPY …) are not
// supported yet, so they return null like any unknown currency.
const MINIMUMS: Record<string, number> = {
  usd: 50,
  gbp: 30,
  eur: 50,
  inr: 50,
  aud: 50,
  cad: 50,
  nzd: 50,
  sgd: 50,
  chf: 50,
};

export function stripeMinimumChargeMinor(currency: string): number | null {
  return MINIMUMS[currency.toLowerCase()] ?? null;
}
