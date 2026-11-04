import { handleURLCallback } from "@stripe/stripe-react-native";

/** Where Stripe sends the parent back after a bank's 3-D Secure page (the app's scheme). */
export const STRIPE_RETURN_URL = "jarso://stripe-redirect";

// The full deep link, or the path Expo Go leaves of it; a query string may follow.
const STRIPE_RETURN = /^(?:jarso:\/\/|\/)stripe-redirect(?:[/?#]|$)/;

/**
 * Expo Router's `redirectSystemPath` step for the 3-D Secure return: the URL goes to Stripe
 * (iOS finishes the sheet with it; Android's SDK has already resumed) and never reaches the
 * router, so the parent stays on the open sheet instead of an unknown route. A cold start from
 * the link opens home. Every other path passes through unchanged.
 */
export async function redirectStripeReturn(event: {
  path: string;
  initial: boolean;
}): Promise<string | null> {
  if (!STRIPE_RETURN.test(event.path)) return event.path;
  try {
    await handleURLCallback(event.path);
  } catch {
    // Nothing to show: the webhook settles the payment either way.
  }
  return event.initial ? "/" : null;
}
