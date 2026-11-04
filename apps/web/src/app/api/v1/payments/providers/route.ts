import { assertRole } from "@/features/family/server";
import { providersQuerySchema } from "@/features/payments";
import { getInAppProviders } from "@/features/payments/server";
import { json, withApi } from "@/lib/api";

/**
 * For the phone: which providers can pay in the native sheet, with the parent's saved card at
 * each, and with `?childId=&kind=&id=` that item's card handover state. Parents only.
 */
export const GET = withApi(
  async (request: Request) => {
    await assertRole("parent");
    const query = new URL(request.url).searchParams;
    const { childId, kind, id } = providersQuerySchema.parse({
      childId: query.get("childId") ?? undefined,
      kind: query.get("kind") ?? undefined,
      id: query.get("id") ?? undefined,
    });
    const item = childId && kind && id ? { childId, kind, id } : undefined;
    return json(await getInAppProviders(item));
  },
  { bearer: true },
);
