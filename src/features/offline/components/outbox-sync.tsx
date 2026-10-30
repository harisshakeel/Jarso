"use client";

import { useEffect } from "react";
import { flushOutbox } from "../outbox/flush";
import { sendToServer } from "../outbox/send";
import { useOutbox } from "../outbox/use-outbox";
import { onNetworkSuccess } from "../use-online";

const POLL_MS = 30_000;

/** Sends the signed-in child's waiting items whenever the connection may be back. Renders nothing. */
export function OutboxSync({ userId }: { userId: string }) {
  const items = useOutbox(userId);
  const waiting = items.some((item) => item.status === "waiting");

  useEffect(() => {
    const run = () => void flushOutbox(userId, sendToServer);
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
    const timer = setInterval(() => void flushOutbox(userId, sendToServer), POLL_MS);
    return () => clearInterval(timer);
  }, [userId, waiting]);

  // One timer for the earliest backoff, so the short 2 s / 5 s steps aren't left to the poll.
  useEffect(() => {
    const now = Date.now();
    const due = items
      .filter((item) => item.status === "waiting")
      .map((item) => Date.parse(item.nextAttemptAt))
      .filter((at) => at > now);
    if (due.length === 0) return;
    const timer = setTimeout(() => void flushOutbox(userId, sendToServer), Math.min(...due) - now);
    return () => clearTimeout(timer);
  }, [userId, items]);

  return null;
}
