"use client";

import { coachIdFor, JarCoach } from "@/components/brand";

import { offlineCopy } from "../copy";
import { useOnline } from "../use-online";

/** Calm notice under the header while the device is offline. */
export function OfflineBanner() {
  const online = useOnline();
  return (
    <div role="status">
      {online ? null : (
        <p className="flex items-center justify-center gap-2 border-hairline border-b bg-muted px-4 py-1.5 text-center text-ink-2 text-sm">
          <JarCoach coach={coachIdFor("offline")} size={28} />
          {offlineCopy.offline}
        </p>
      )}
    </div>
  );
}
