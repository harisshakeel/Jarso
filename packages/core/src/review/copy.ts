import type { WeekMoney } from "./types";

/** "Fri 30 Oct" for the week's edges. Calendar days, so formatted in UTC. */
export function weekDay(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * The week's money as one sentence instead of a grid of figures (design.md §10): what came in,
 * what went out, what moved to Save. Nothing moved reads as a calm line, never four zeros.
 */
export function weekSentence(week: WeekMoney, money: (minor: number) => string): string {
  const parts: string[] = [];
  if (week.receivedMinor > 0) parts.push(`${money(week.receivedMinor)} came in`);
  if (week.spentMinor > 0) parts.push(`you spent ${money(week.spentMinor)}`);
  if (week.savedMinor > 0) parts.push(`${money(week.savedMinor)} went into Save`);
  if (week.savedMinor < 0) parts.push(`${money(-week.savedMinor)} came out of Save`);
  if (parts.length === 0) return "No money moved this week.";
  const last = parts.pop();
  const body = parts.length ? `${parts.join(", ")} and ${last}` : last;
  return `This week ${body}.`;
}

/** The "Your week" card's words (FR11). Amounts come in already formatted. */
export const weekCopy = {
  heading: "Your week",
  range: (from: string, to: string) => `${from} to ${to}`,
  mostWentOn: (label: string) => `This week most went on ${label}.`,
  stillDue: (amount: string) => `${amount} of allowance is still on its way from your parent.`,
  goalProgress: (emoji: string, name: string, counted: string, target: string) =>
    `${emoji} ${name}: ${counted} of ${target}.`,
  paymentsLeft: (n: number) => ` About ${n} allowance${n === 1 ? "" : "s"} to go.`,
  remaining: (amount: string) => ` ${amount} to go.`,
  goalReached: (emoji: string, name: string) => `${emoji} ${name}: saved up.`,
  seeWhole: "See your whole week",
  oneDecision: "One decision",
  planSame: "The plan stays as it was.",
  learning: "Learning",
  showedYouCan: "You showed you can",
  goodThinking: ". Good thinking.",
  worthAnotherLook: (label: string) => `Worth another look: ${label}.`,
  firstSkill: "Your first skill is one mission away.",
  freshQuestion: "One fresh question",
} as const;
