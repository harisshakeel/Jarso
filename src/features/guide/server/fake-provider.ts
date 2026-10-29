import "server-only";
import type { GuideProvider } from "./provider";

/**
 * A deterministic stand-in for Claude, for e2e runs and tests (GUIDE_PROVIDER=fake). It routes by
 * keyword and answers with fixed text. Never used on Vercel production (see config.ts).
 */
export function createFakeProvider(): GuideProvider {
  return {
    name: "fake",

    async screenInput({ text }) {
      const lower = text.toLowerCase();
      const route = /\b(hurt|scared|sad|bully|bullied|hit me|kill myself|abuse)\b/.test(lower)
        ? "safety"
        : /ignore (your|all|the) (rules|instructions)|pretend (you are|to be)|system prompt/.test(
              lower,
            )
          ? "jailbreak"
          : /\b(my address|my phone|my school is|my full name)\b/.test(lower)
            ? "personal_info"
            : /\b(football|minecraft|homework|celebrity)\b/.test(lower)
              ? "off_topic"
              : /\b(weapon|drugs)\b/.test(lower)
                ? "unsafe"
                : "on_topic";
      return { route, usage: { screenInput: 0, screenOutput: 0 } };
    },

    async reply({ context }) {
      const midExercise =
        context.includes("Tries so far: 0") || context.includes("Tries so far: 1");
      const reply = midExercise
        ? "Let's think it through together. What do you have, and what does it cost? Compare those two first."
        : "Saving means keeping some money for later. A little each week adds up, and Save is where it grows toward your goal.";
      return {
        kind: "ok",
        reply: {
          reply,
          topics: midExercise ? [] : ["saving-goal"],
          check: midExercise
            ? null
            : {
                question: "Which jar does a goal count?",
                options: ["Spend", "Save"],
                answerIndex: 1,
                explanation: "A goal counts only what's in Save.",
              },
        },
        usage: {},
        model: "fake",
      };
    },

    async screenOutput({ reply }) {
      const pass = !/\bbuy\b/i.test(reply);
      return { pass, problem: pass ? "none" : "product_or_purchase", usage: {} };
    },
  };
}
