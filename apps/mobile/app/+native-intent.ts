import { redirectStripeReturn } from "@/features/payments";

// Expo Router runs every incoming deep link through this before routing.
export const redirectSystemPath = redirectStripeReturn;
