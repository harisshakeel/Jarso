"use client";

import { BellIcon } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui";
import { clientEnv } from "@/config";
import { pushOwnedAction, subscribePushAction, unsubscribePushAction } from "../server/actions";

const SW_PATH = "/sw.js";

type State = "checking" | "unsupported" | "blocked" | "off" | "on";

/** The VAPID public key as the `applicationServerKey` bytes the browser wants. */
export function keyBytes(base64url: string): Uint8Array {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

const COPY: Record<State, string> = {
  checking: "Checking this device…",
  unsupported:
    "This browser can't show notifications. Installing Jarso from the browser menu may help.",
  blocked: "Notifications are blocked for Jarso in your browser settings.",
  off: "Get a ping when something new lands in your inbox, even when Jarso is closed.",
  on: "This device gets a ping when something new lands in your inbox.",
};

/**
 * Web push (FR16): one switch for this browser. Hidden when the deployment has no push key.
 * The subscription lives in the browser; the server only keeps a copy to send to.
 */
export function PushToggle() {
  const publicKey = clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<State>("checking");
  const [pending, startTransition] = useTransition();
  const labelId = useId();
  const hintId = useId();

  useEffect(() => {
    if (!publicKey) return;
    if (!supported()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    let cancelled = false;
    navigator.serviceWorker
      .getRegistration(SW_PATH)
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      // A browser two accounts share may hold the other account's subscription: on means ours.
      .then(async (subscription) => {
        if (!subscription) return false;
        const result = await pushOwnedAction(null, { endpoint: subscription.endpoint });
        return result.ok && result.data.owned;
      })
      .then((owned) => {
        if (!cancelled) setState(owned ? "on" : "off");
      })
      .catch(() => {
        if (!cancelled) setState("off");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!publicKey) return null;

  function turnOn(key: string) {
    startTransition(async () => {
      let subscription: PushSubscription | null = null;
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.register(SW_PATH);
        await navigator.serviceWorker.ready;
        subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(key) as BufferSource,
          }));
        const { keys } = subscription.toJSON();
        const result = await subscribePushAction(null, {
          endpoint: subscription.endpoint,
          keys: { p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" },
        });
        if (!result.ok) {
          await subscription.unsubscribe().catch(() => undefined);
          toast.error(result.error.message);
          return;
        }
        setState("on");
        toast.success("You'll get a ping on this device.");
      } catch {
        await subscription?.unsubscribe().catch(() => undefined);
        toast.error("That didn't work. Try again in a moment.");
      }
    });
  }

  function turnOff() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const { endpoint } = subscription;
          await subscription.unsubscribe();
          const result = await unsubscribePushAction(null, { endpoint });
          if (!result.ok) toast.error(result.error.message);
        }
        setState("off");
      } catch {
        toast.error("That didn't work. Try again in a moment.");
      }
    });
  }

  const disabled =
    pending || state === "checking" || state === "unsupported" || state === "blocked";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-card p-4">
      <BellIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-2" />
      <div className="grid flex-1 gap-1">
        <span id={labelId} className="font-semibold">
          Pings on this device
        </span>
        <p id={hintId} className="text-ink-2 text-sm">
          {COPY[state]}
        </p>
      </div>
      <Switch
        aria-labelledby={labelId}
        aria-describedby={hintId}
        checked={state === "on"}
        disabled={disabled}
        onCheckedChange={(checked) => (checked ? turnOn(publicKey) : turnOff())}
      />
    </div>
  );
}
