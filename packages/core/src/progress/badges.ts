export const BADGE_KEYS = [
  "first_log",
  "logs_10",
  "logs_50",
  "logs_100",
  "diary_week",
  "first_checkin",
  "checkins_7",
  "checkins_30",
  "streak_3",
  "streak_7",
  "streak_14",
  "streak_30",
  "first_save",
  "saves_5",
  "saves_20",
  "first_mission",
  "missions_5",
  "missions_10",
  "goal_set",
  "goal_half",
  "goal_reached",
  "level_3",
  "level_5",
  // Granted by complete_child_onboarding (the phone's intro), not progress_check_badges.
  "jar_starter",
] as const;

export type BadgeKey = (typeof BADGE_KEYS)[number];

type BadgeInfo = { name: string; how: string; icon: string };

/** `icon` is a lucide icon name. */
export const BADGES: Record<BadgeKey, BadgeInfo> = {
  first_log: { name: "First Note", how: "Write down your first spend", icon: "pencil" },
  logs_10: { name: "Note Taker", how: "Write down 10 things", icon: "notebook-pen" },
  logs_50: { name: "Diary Pro", how: "Write down 50 things", icon: "book-open" },
  logs_100: { name: "Diary Star", how: "Write down 100 things", icon: "book-marked" },
  diary_week: {
    name: "Week Writer",
    how: "Write in your diary 7 days running",
    icon: "calendar-check",
  },
  first_checkin: { name: "Hello Jarso", how: "Do your first daily check-in", icon: "hand-metal" },
  checkins_7: { name: "Regular", how: "Check in on 7 days", icon: "calendar-days" },
  checkins_30: { name: "Check-in Champ", how: "Check in on 30 days", icon: "calendar-heart" },
  streak_3: { name: "On a Roll", how: "Keep a 3 day streak", icon: "flame" },
  streak_7: { name: "Week Streak", how: "Keep a 7 day streak", icon: "flame-kindling" },
  streak_14: { name: "Fortnight Streak", how: "Keep a 14 day streak", icon: "zap" },
  streak_30: { name: "Month Streak", how: "Keep a 30 day streak", icon: "trophy" },
  first_save: { name: "First Save", how: "Save money for the first time", icon: "piggy-bank" },
  saves_5: { name: "Steady Saver", how: "Save money 5 times", icon: "coins" },
  saves_20: { name: "Super Saver", how: "Save money 20 times", icon: "vault" },
  first_mission: { name: "Mission Done", how: "Finish your first mission", icon: "flag" },
  missions_5: { name: "Mission Mover", how: "Finish 5 missions", icon: "rocket" },
  missions_10: { name: "Mission Master", how: "Finish 10 missions", icon: "medal" },
  goal_set: { name: "Goal Setter", how: "Set a savings goal", icon: "target" },
  goal_half: { name: "Halfway There", how: "Reach half of a goal", icon: "gauge" },
  goal_reached: { name: "Goal Getter", how: "Reach a savings goal", icon: "party-popper" },
  level_3: { name: "Smart Saver", how: "Reach level 3", icon: "star" },
  level_5: { name: "Money Maker", how: "Reach level 5", icon: "crown" },
  jar_starter: { name: "Jar Starter", how: "Finish your Jarso intro", icon: "sparkles" },
};
