import {
  cancelInAppPayment,
  completeFakeSheet,
  getPaymentProviders,
  getPaymentStatus,
  removeCard,
  setAutoCharge,
  startInAppPayment,
} from "@/features/payments";
import { supabase } from "@/lib/supabase/client";
import appJson from "../../../app.json";

jest.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

const getSession = supabase.auth.getSession as jest.Mock;
const fetchMock = jest.fn();
const PAYMENT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  fetchMock.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: "jwt-1" } }, error: null });
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
  );
  globalThis.fetch = fetchMock;
});

function call(index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  const headers = init.headers as Record<string, string>;
  return {
    path: url.replace("http://127.0.0.1:3000", ""),
    method: init.method,
    body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
    auth: headers.Authorization,
  };
}

describe("payments api", () => {
  it("startInAppPayment posts to /api/v1/payments/in-app with auth and the body", async () => {
    const body = {
      kind: "allowance" as const,
      id: PAYMENT,
      provider: "stripe" as const,
      cashMinor: 300,
      savedMinor: 200,
    };
    await startInAppPayment(body);
    expect(call()).toEqual({
      path: "/api/v1/payments/in-app",
      method: "POST",
      body,
      auth: "Bearer jwt-1",
    });
  });

  it("getPaymentStatus reads /api/v1/payments/:id", async () => {
    await getPaymentStatus(PAYMENT);
    expect(call()).toMatchObject({ path: `/api/v1/payments/${PAYMENT}`, method: "GET" });
  });

  it("cancelInAppPayment posts to the cancel route", async () => {
    await cancelInAppPayment(PAYMENT);
    expect(call()).toMatchObject({
      path: `/api/v1/payments/${PAYMENT}/cancel`,
      method: "POST",
      auth: "Bearer jwt-1",
    });
  });

  it("setAutoCharge patches /api/v1/payments/auto-charge", async () => {
    await setAutoCharge({ type: "parent_gift", id: PAYMENT, on: false });
    expect(call()).toMatchObject({
      path: "/api/v1/payments/auto-charge",
      method: "PATCH",
      body: { type: "parent_gift", id: PAYMENT, on: false },
    });
  });

  it('removeCard("stripe") calls DELETE /api/v1/payments/cards/stripe', async () => {
    await removeCard("stripe");
    expect(call()).toMatchObject({
      path: "/api/v1/payments/cards/stripe",
      method: "DELETE",
      auth: "Bearer jwt-1",
    });
  });

  it("getPaymentProviders sends the item as a query", async () => {
    await getPaymentProviders({ childId: "c", kind: "gift", id: "g" });
    expect(call().path).toBe("/api/v1/payments/providers?childId=c&kind=gift&id=g");
    await getPaymentProviders();
    expect(call(1).path).toBe("/api/v1/payments/providers");
  });

  it("completeFakeSheet posts to the fake completion route", async () => {
    await completeFakeSheet({ mode: "payment", ref: PAYMENT, outcome: "pay" });
    expect(call()).toMatchObject({
      path: "/api/v1/payments/fake/complete",
      method: "POST",
      body: { mode: "payment", ref: PAYMENT, outcome: "pay" },
    });
  });
});

describe("native config", () => {
  it("adds the Stripe config plugin without Google Pay", () => {
    const plugins = appJson.expo.plugins as (string | [string, unknown])[];
    expect(plugins).toContainEqual(["@stripe/stripe-react-native", { enableGooglePay: false }]);
  });
});
