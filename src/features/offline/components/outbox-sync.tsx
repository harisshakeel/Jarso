"use client";

import { useEffect } from "react";
import { flush } from "../outbox/flush";
import { sendToServer } from "../outbox/send";
import { useOutbox } from "../outbox/use-outbox";
import { onNetworkSuccess } from "../use-online";

const POLL_MS = 30_000;

/** Sends the signed-in child's waiting items whenever the connection may be back. Renders nothing. */
export function OutboxSync({ userId }: { userId: string }) {
  const waiting = useOutbox(userId).some((item) => item.status === "waiting");

  useEffect(() => {
    const run = () => void flush(userId, sendToServer);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const stop = onNetworkSuccess(run);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [userId]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void flush(userId, sendToServer), POLL_MS);
    return () => clearInterval(timer);
  }, [userId, waiting]);

  return null;
}
