import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/auth/server", () => ({ assertUser: vi.fn() }));
vi.mock("@/lib/payments", () => ({ razorpayCheckoutKeyId: vi.fn() }));
vi.mock("@/features/payments/server/repository", () => ({ hasPendingSetup: vi.fn() }));

const auth = await import("@/features/auth/server");
const payments = await import("@/lib/payments");
const repo = await import("@/features/payments/server/repository");
const { getRazorpayCheckoutFor } = await import("@/features/payments/server/razorpay-checkout");

const KEY_ID = "rzp_test_XXXXXXXXXXXXXX";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(payments.razorpayCheckoutKeyId).mockReturnValue(KEY_ID);
  vi.mocked(auth.assertUser).mockResolvedValue({ id: "parent-1" } as never);
  vi.mocked(repo.hasPendingSetup).mockResolvedValue(true);
});

describe("getRazorpayCheckoutFor", () => {
  it("returns the key id for the parent's own pending order", async () => {
    await expect(getRazorpayCheckoutFor("order_abc")).resolves.toEqual({ keyId: KEY_ID });
    expect(repo.hasPendingSetup).toHaveBeenCalledWith(
      { kind: "user" },
      { parentId: "parent-1", provider: "razorpay", providerRef: "order_abc" },
    );
  });

  it("refuses an order that is not the parent's pending setup", async () => {
    vi.mocked(repo.hasPendingSetup).mockResolvedValue(false);
    await expect(getRazorpayCheckoutFor("order_other")).resolves.toBeNull();
  });

  it("is null while Razorpay is off, without a lookup", async () => {
    vi.mocked(payments.razorpayCheckoutKeyId).mockReturnValue(null);
    await expect(getRazorpayCheckoutFor("order_abc")).resolves.toBeNull();
    expect(repo.hasPendingSetup).not.toHaveBeenCalled();
  });
});
