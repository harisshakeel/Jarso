import type { PictureTint } from "@jarso/core/home";
import {
  ArrowLeftIcon,
  BriefcaseIcon,
  BusIcon,
  CakeIcon,
  CheckIcon,
  CoinsIcon,
  CookieIcon,
  DeleteIcon,
  EllipsisIcon,
  Gamepad2Icon,
  GiftIcon,
  HandCoinsIcon,
  HandHelpingIcon,
  type LucideIcon,
  PencilRulerIcon,
  PiggyBankIcon,
  SendIcon,
  ShirtIcon,
  ShoppingBagIcon,
  SmartphoneIcon,
  TagIcon,
  TargetIcon,
  TicketIcon,
  UsersIcon,
  WalletIcon,
  XIcon,
} from "lucide-react-native";

/** The Lucide icons the picture lists name (kebab case in core). Unknown names show an ellipsis. */
const ICONS: Record<string, LucideIcon> = {
  "arrow-left": ArrowLeftIcon,
  briefcase: BriefcaseIcon,
  bus: BusIcon,
  cake: CakeIcon,
  check: CheckIcon,
  coins: CoinsIcon,
  cookie: CookieIcon,
  delete: DeleteIcon,
  ellipsis: EllipsisIcon,
  "gamepad-2": Gamepad2Icon,
  gift: GiftIcon,
  "hand-coins": HandCoinsIcon,
  "hand-helping": HandHelpingIcon,
  "pencil-ruler": PencilRulerIcon,
  "piggy-bank": PiggyBankIcon,
  send: SendIcon,
  shirt: ShirtIcon,
  "shopping-bag": ShoppingBagIcon,
  smartphone: SmartphoneIcon,
  tag: TagIcon,
  target: TargetIcon,
  ticket: TicketIcon,
  users: UsersIcon,
  wallet: WalletIcon,
  x: XIcon,
};

export function pictureIcon(name: string): LucideIcon {
  return ICONS[name] ?? EllipsisIcon;
}

/** Soft square behind an icon (a class) and the icon's colour on it (a brand token key). */
export const TINT: Record<
  PictureTint,
  { box: string; icon: "primary" | "ai" | "gold-text" | "accent-text" | "success-text" }
> = {
  teal: { box: "bg-tint-teal", icon: "primary" },
  grape: { box: "bg-tint-grape", icon: "ai" },
  gold: { box: "bg-tint-gold", icon: "gold-text" },
  cyan: { box: "bg-tint-cyan", icon: "accent-text" },
  success: { box: "bg-success-soft", icon: "success-text" },
};
