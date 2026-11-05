import type { LucideIcon } from "lucide-react";
import {
  BrushCleaningIcon,
  BusIcon,
  CakeIcon,
  CircleEllipsisIcon,
  CoinsIcon,
  CookieIcon,
  Gamepad2Icon,
  GiftIcon,
  PencilIcon,
  ShirtIcon,
  SmartphoneIcon,
  TagIcon,
  TicketIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "@/lib";

// What money was for or where it came from, drawn with the app's own line icons instead of
// emoji (2026-11-06): the same look as the rest of the app, the same on every device.

const SPEND: Record<string, LucideIcon> = {
  snacks: CookieIcon,
  games: Gamepad2Icon,
  clothes: ShirtIcon,
  going_out: TicketIcon,
  gift_for_someone: GiftIcon,
  school: PencilIcon,
  travel: BusIcon,
  apps: SmartphoneIcon,
  other: CircleEllipsisIcon,
};

const RECEIVED: Record<string, LucideIcon> = {
  family: UsersIcon,
  birthday: CakeIcon,
  job: BrushCleaningIcon,
  sold: TagIcon,
  found: CoinsIcon,
  other: CircleEllipsisIcon,
};

/** The icon for a category key. A missing or unknown key reads as Other. Decorative. */
export function CategoryIcon({
  category,
  kind,
  className,
}: {
  category: string | null;
  kind: "purchase" | "received";
  className?: string;
}) {
  const list = kind === "purchase" ? SPEND : RECEIVED;
  const key = category && list[category] ? category : "other";
  const Icon = list[key] ?? CircleEllipsisIcon;
  return (
    <Icon
      aria-hidden
      data-category={key}
      className={cn("inline-block size-4 shrink-0", className)}
    />
  );
}
