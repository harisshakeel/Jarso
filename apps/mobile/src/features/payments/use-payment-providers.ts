import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { type CardItem, getPaymentProviders } from "./api";

/**
 * The providers with a native sheet and the parent's saved card at each; with `item`, that
 * item's card handover state (`item.providers` empty: card payments are off). Parents only.
 */
export function usePaymentProviders(item?: CardItem) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.paymentProviders(item && `${item.kind}:${item.id}`),
    enabled: Boolean(userId),
    queryFn: () => getPaymentProviders(item),
  });
}
