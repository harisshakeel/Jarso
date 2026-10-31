"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { routes } from "@/config";
import { noticeText } from "../links";
import { subscribeToNotices } from "../realtime";

const REFRESH_DELAY_MS = 300;

type NoticeListenerProps = { userId: string; viewer: "parent" | "child"; currency: string };

/**
 * Keeps the Inbox badge, the inbox and "Needs you" live. On a new or updated notice it refreshes
 * the server-rendered page (one refresh per burst) and toasts new arrivals. Each time the
 * channel joins (first or after a drop) it refreshes once, covering anything sent between the
 * server render and the join. Renders nothing.
 */
export function NoticeListener({ userId, viewer, currency }: NoticeListenerProps) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connected = false;
    const refresh = () => {
      clearTimeout(timer);
      // Offline, a refresh falls back to a full page load and loses the page; the rejoin catches up.
      timer = setTimeout(() => {
        if (navigator.onLine) router.refresh();
      }, REFRESH_DELAY_MS);
    };
    const inbox = viewer === "parent" ? routes.parentInbox : routes.childInbox;

    const unsubscribe = subscribeToNotices(
      userId,
      (change) => {
        refresh();
        if (change.type !== "new") return;
        const { title } = noticeText(change.notice, viewer, currency);
        toast(title, { action: { label: "Open", onClick: () => router.push(inbox) } });
      },
      (isConnected) => {
        if (isConnected && !connected) refresh();
        connected = isConnected;
      },
    );
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, viewer, currency, router]);

  return null;
}
