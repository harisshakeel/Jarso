import { availableWear, type Wear } from "../mascot";

export function parentLabel(name: string | null | undefined): string {
  return name?.trim() ? name.trim() : "your parent";
}

export function wearForLevel(level: number): Wear[] {
  return availableWear(level);
}

export const progressCopy = {
  checkinQuestion: "Spend anything today?",
  nope: "Nope",
  yes: "Yes",
  restDay: "1 free rest day a week",
  levelUp: (n: number, name: string) => `Level ${n}! ${name}`,
  streakDays: (n: number) => `${n} days`,
};
