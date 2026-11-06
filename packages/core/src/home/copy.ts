import type { HomeMoment } from "./moments";
import type { PictureIcon, PictureTint } from "./pictures";
import { capitalise } from "./words";

/** The words on Home's fixed pieces. */
export const homeCopy = {
  greeting: (name: string | null) => (name ? `Hi ${name}!` : "Hi!"),
  spendTile: { name: "Spend", caption: "In your pocket" },
  saveTile: { name: "Save", caption: (parent: string) => `${capitalise(parent)} keeps it` },
  me: "Me",
  bell: "Notifications",
  sparks: (n: number) => `${n} Sparks`,
  streak: (n: number) => (n === 1 ? "1 day" : `${n} days`),
} as const;

/** The two lines (and optional chip) on a moment card. */
export function momentLines(
  m: HomeMoment,
  money: (minor: number) => string,
  parent: string,
): { title: string; line: string; chip?: string } {
  const Parent = capitalise(parent);
  if (m.kind === "said-yes") {
    const amount = money(m.request.amountMinor);
    return {
      title: `${Parent} said yes!`,
      line:
        m.request.kind === "emergency"
          ? `${amount} extra is coming`
          : `${amount} from savings is coming`,
    };
  }
  if (m.kind === "allowance-due") {
    return {
      title: "Pocket money day!",
      line: `+${money(m.amountMinor)} · ${Parent} hands it over`,
    };
  }
  const amount = money(m.request.amountMinor);
  const chip = m.more > 0 ? `${m.more + 1} waiting` : "Waiting";
  if (m.request.kind === "deposit") {
    return { title: `Save ${amount}`, line: `Give the cash to ${parent}`, chip };
  }
  if (m.request.kind === "withdrawal") {
    return { title: `Use ${amount} savings`, line: `Waiting for ${parent}`, chip };
  }
  return { title: `Extra ${amount}`, line: `Waiting for ${parent}`, chip };
}

export type MoneyActionKey = "purchase" | "received" | "put-in" | "take-out" | "ask-extra";

/** The "What happened?" sheet's five choices. */
export function moneyActions(parent: string): {
  key: MoneyActionKey;
  label: string;
  hint: string;
  icon: PictureIcon;
  tint: PictureTint;
}[] {
  return [
    {
      key: "purchase",
      label: "I bought something",
      hint: "From Spend",
      icon: "shopping-bag",
      tint: "teal",
    },
    {
      key: "received",
      label: "I got money",
      hint: "Gift, pay, found",
      icon: "gift",
      tint: "success",
    },
    {
      key: "put-in",
      label: "Save some",
      hint: `Give cash to ${parent}`,
      icon: "piggy-bank",
      tint: "gold",
    },
    {
      key: "take-out",
      label: "Use savings",
      hint: `Ask ${parent} for it`,
      icon: "hand-coins",
      tint: "cyan",
    },
    {
      key: "ask-extra",
      label: "Ask for extra",
      hint: "Need a bit more?",
      icon: "hand-helping",
      tint: "grape",
    },
  ];
}

/** The add sheet and the asks list's own lines. */
export const addSheetCopy = {
  title: "What happened?",
  open: "What happened?",
  myAsks: "My asks",
  waiting: (n: number) => `${n} waiting`,
  close: "Close",
} as const;
