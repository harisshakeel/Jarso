import { fakeInAppCompleteSchema } from "@/features/payments";
import { completeFakeInApp } from "@/features/payments/server";
import { json, parseBody, withApi } from "@/lib/api";

/**
 * For the phone's test-card dialog in dev builds: completes the parent's own fake payment or card
 * setup as the fake provider's webhook would. 404 unless the fake provider is on (never on
 * production); the service checks the parent role and that the payment or setup is theirs.
 */
export const POST = withApi(
  async (request: Request) => {
    const input = await parseBody(request, fakeInAppCompleteSchema);
    await completeFakeInApp(input);
    return json({ ok: true });
  },
  { bearer: true },
);
