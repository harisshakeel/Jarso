const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Sent just now", "Sent 5 minutes ago", "Sent yesterday"… Invitations live 7 days, so days suffice. */
export function sentAgo(createdAt: string, now: number): string {
  const elapsed = Math.max(0, now - new Date(createdAt).getTime());
  if (elapsed < MINUTE) return "Sent just now";
  if (elapsed < HOUR) return `Sent ${relative.format(-Math.floor(elapsed / MINUTE), "minute")}`;
  if (elapsed < DAY) return `Sent ${relative.format(-Math.floor(elapsed / HOUR), "hour")}`;
  return `Sent ${relative.format(-Math.floor(elapsed / DAY), "day")}`;
}
