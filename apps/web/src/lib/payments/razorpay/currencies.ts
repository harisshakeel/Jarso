// Razorpay is INR only here (spec D5). Its minimum charge is ₹1, so 100 paise.
export function razorpayMinimumChargeMinor(currency: string): number | null {
  return currency.toUpperCase() === "INR" ? 100 : null;
}
