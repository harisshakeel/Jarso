import { RECEIVED_CATEGORIES, SPEND_CATEGORIES } from "@jarso/core/ledger";

// Picture buttons for the child's pickers: a category with an icon and a tint.

export type PictureTint = "teal" | "grape" | "gold" | "cyan" | "success";
/** A Lucide icon name in kebab case. */
export type PictureIcon = string;
export type PictureOption = { key: string; label: string; icon: PictureIcon; tint: PictureTint };

/** Tints cycle in this order down any list of pictures. */
export const PICTURE_TINTS: readonly PictureTint[] = ["teal", "grape", "gold", "cyan", "success"];

const SPEND_ICONS: Record<string, PictureIcon> = {
  snacks: "cookie",
  games: "gamepad-2",
  clothes: "shirt",
  going_out: "ticket",
  gift_for_someone: "gift",
  school: "pencil-ruler",
  travel: "bus",
  apps: "smartphone",
  other: "ellipsis",
};

const RECEIVED_ICONS: Record<string, PictureIcon> = {
  family: "users",
  birthday: "cake",
  job: "briefcase",
  sold: "tag",
  found: "coins",
  other: "ellipsis",
};

function pictures(
  list: readonly { key: string; label: string }[],
  icons: Record<string, PictureIcon>,
): PictureOption[] {
  return list.map((c, i) => ({
    key: c.key,
    label: c.label,
    icon: icons[c.key] ?? "ellipsis",
    tint: PICTURE_TINTS[i % PICTURE_TINTS.length] as PictureTint,
  }));
}

/** The nine things money is spent on, as a 3 x 3 grid. */
export function spendPictures(): PictureOption[] {
  return pictures(SPEND_CATEGORIES, SPEND_ICONS);
}

/** The six places money can come from. */
export function receivedPictures(): PictureOption[] {
  return pictures(RECEIVED_CATEGORIES, RECEIVED_ICONS);
}
