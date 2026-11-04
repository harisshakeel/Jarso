import { devicePushTokenDeleteSchema, devicePushTokenSchema } from "@/features/notifications";
import { registerDeviceToken, unregisterDeviceToken } from "@/features/notifications/server";
import { json, parseBody, withApi } from "@/lib/api";

/**
 * For the phone: registers this phone's Expo push token for the signed-in member (parent or
 * child), after sign-in. The token moves to this account if another one used the phone; a
 * member keeps at most 10 (`register_device_push_token`). 403 outside a family.
 */
export const POST = withApi(
  async (request: Request) => {
    const body = await parseBody(request, devicePushTokenSchema);
    return json(await registerDeviceToken(body), { status: 201 });
  },
  { bearer: true },
);

/** For the phone: forgets this phone's token for the signed-in member, before sign-out. */
export const DELETE = withApi(
  async (request: Request) => {
    const { token } = await parseBody(request, devicePushTokenDeleteSchema);
    return json(await unregisterDeviceToken(token));
  },
  { bearer: true },
);
