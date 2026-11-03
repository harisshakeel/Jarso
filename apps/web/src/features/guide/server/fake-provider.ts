import "server-only";
import { actionFieldNames } from "@jarso/core/guide";
import type { GuideProvider } from "./provider";

/** Every `propose_action` field, null, as the real model sends them. */
const NO_FIELDS = Object.fromEntries(actionFieldNames.map((name) => [name, null]));

/** A reply that says the guide itself did something: only the app may say that. */
const CLAIMS_ACTION =
  /\b(i've|i have|i)\s+(recorded|written|moved|added|sent|approved|declined|handed|changed|saved)\b|\b(it's|it is|all) done\b/i;

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

    async reply({ text, context, tools }) {
      // The signal is ignored: the fake answers at once. Two questions look things up, so e2e
      // runs cover the look-up path end to end (status line, figure refs, the parent's view).
      const lower = text.toLowerCase();
      // "I want to save for headphones for 30": offers the goal card (goal by chat).
      const wish =
        /\bsave (?:up )?for (?:a |an |some |the )?([a-z][a-z ]{1,30}?)(?: for| that costs| costing| at)? [£$€]?(\d+(?:\.\d{1,2})?)\b/.exec(
          lower,
        );
      if (wish?.[1] && wish[2]) {
        const result = await tools.run("propose_goal", {
          title: wish[1].trim(),
          price: wish[2],
          save_each: null,
        });
        return {
          kind: "ok",
          reply: {
            reply: result.isError
              ? "I couldn't work that out just now."
              : "That's {{goal_idea.still_needed}} more to save. You could make it your goal if you like.",
            topics: ["saving-goal"],
            check: null,
          },
          usage: {},
          model: "fake",
        };
      }
      // "I got 5 from grandma (into save)": prepares money received, asking for the jar first.
      const got =
        /\bi got [£$€]?(\d+(?:\.\d{1,2})?) from ([a-z]+)(?:.*?\b(?:into|in|to) (spend|save)\b)?/.exec(
          lower,
        );
      if (got?.[1] && got[2]) {
        const result = await tools.run("propose_action", {
          kind: "money_received",
          fields: { ...NO_FIELDS, amount: got[1], label: got[2], jar: got[3] ?? null },
        });
        const data = JSON.parse(result.content) as { missing?: string[] };
        return {
          kind: "ok",
          reply: {
            reply: result.isError
              ? "I couldn't get that ready just now."
              : data.missing
                ? "Nice. Which jar should it go in, Spend or Save?"
                : "I've got that ready. Check the card and tap Do it if it's right.",
            topics: [],
            check: null,
          },
          usage: {},
          model: "fake",
        };
      }
      const lookup = /\bhow much do i have\b|\bmy jars\b/.test(lower)
        ? {
            tool: "get_jars",
            input: {},
            reply: "You have {{jars.spend}} in Spend and {{jars.save}} in Save.",
          }
        : /\b(spend|spent) this week\b/.test(lower)
          ? {
              tool: "get_money_history",
              input: { period: "this_week" },
              reply: "This week you spent {{history.spent}}.",
            }
          : null;
      if (lookup) {
        const result = await tools.run(lookup.tool, lookup.input);
        return {
          kind: "ok",
          reply: {
            reply: result.isError ? "I couldn't look that up just now." : lookup.reply,
            topics: ["spending"],
            check: null,
          },
          usage: {},
          model: "fake",
        };
      }
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

    async wordNotice({ line }) {
      // The fixed line back, unchanged: e2e runs see the same note as when the guide is off.
      return { line, usage: {} };
    },

    async screenOutput({ reply }) {
      if (CLAIMS_ACTION.test(reply)) return { pass: false, problem: "claims_action", usage: {} };
      const pass = !/\bbuy\b/i.test(reply);
      return { pass, problem: pass ? "none" : "product_or_purchase", usage: {} };
    },
  };
}
