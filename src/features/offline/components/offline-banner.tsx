"use client";

import { offlineCopy } from "../copy";
import { useOnline } from "../use-online";

/** Calm notice under the header while the device is offline. */
export function OfflineBanner() {
  const online = useOnline();
  return (
    <div role="status">
      {online ? null : (
        <p className="border-hairline border-b bg-muted px-4 py-2 text-center text-ink-2 text-sm">
          {offlineCopy.offline}
        </p>
      )}
    </div>
  );
}
