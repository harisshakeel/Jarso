import type {
  FakeInAppCompleteInput,
  InAppPaymentStart,
  InAppProviders,
  InAppSetupStart,
  PaymentProviderId,
  PaymentStatusView,
} from "@jarso/core/payments";
import { apiFetch } from "@/lib/api";

// The phone's card payment calls (`/api/v1/payments/*`, parents only). None of them reports a
// payment as paid: only the provider's webhook does, and the phone reads the status back.

export type CardItem = { childId: string; kind: "allowance" | "gift"; id: string };

/** Starts (or reopens) paying one item by card; the answer is what the native sheet opens with. */
export function startInAppPayment(body: {
  kind: "allowance" | "gift";
  id: string;
  provider: PaymentProviderId;
  cashMinor?: number;
  savedMinor?: number;
}): Promise<InAppPaymentStart> {
  return apiFetch("/api/v1/payments/in-app", { method: "POST", body, auth: true });
}

/** A card payment's status, polled after the sheet closes. */
export function getPaymentStatus(paymentId: string): Promise<PaymentStatusView> {
  return apiFetch(`/api/v1/payments/${encodeURIComponent(paymentId)}`, { auth: true });
}

/** Cancels the parent's own pending card payment (`canceled: false` when there was none). */
export function cancelInAppPayment(paymentId: string): Promise<{ canceled: boolean }> {
  return apiFetch(`/api/v1/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: "POST",
    auth: true,
  });
}

/** Auto charge on or off. With no card saved, turning on answers the save-card sheet's params. */
export function setAutoCharge(body: {
  type: "allowance_schedule" | "parent_gift";
  id: string;
  on: boolean;
  provider?: PaymentProviderId;
  phone?: string;
}): Promise<{ setup: InAppSetupStart | null }> {
  return apiFetch("/api/v1/payments/auto-charge", { method: "PATCH", body, auth: true });
}

/** Removes the parent's saved card at one provider (and the auto charges that use it). */
export async function removeCard(provider: PaymentProviderId): Promise<void> {
  await apiFetch(`/api/v1/payments/cards/${encodeURIComponent(provider)}`, {
    method: "DELETE",
    auth: true,
  });
}

/** Which providers have a native sheet, the parent's card at each, and one item's card state. */
export function getPaymentProviders(item?: CardItem): Promise<InAppProviders> {
  const query = item
    ? `?${new URLSearchParams({ childId: item.childId, kind: item.kind, id: item.id })}`
    : "";
  return apiFetch(`/api/v1/payments/providers${query}`, { auth: true });
}

/** The dev build's test-card dialog: completes the parent's own fake payment or setup. */
export async function completeFakeSheet(body: FakeInAppCompleteInput): Promise<void> {
  await apiFetch("/api/v1/payments/fake/complete", { method: "POST", body, auth: true });
}
