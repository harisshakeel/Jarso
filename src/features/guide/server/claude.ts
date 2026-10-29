import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MAIN_MODEL, SCREEN_MODEL } from "./cost";
import { GUIDE_SYSTEM_PROMPT, INPUT_SCREEN_PROMPT, OUTPUT_SCREEN_PROMPT } from "./prompts";
import {
  type GuideProvider,
  inputScreenSchema,
  type MainResult,
  mainReplySchema,
  outputScreenSchema,
  type Turn,
} from "./provider";

/**
 * The only place that talks to Claude (spec §5.2). Main answers come from Claude Opus 5.5 at low
 * effort; both screens run on Claude Haiku 5.5. Structured outputs keep every response in a
 * known shape. Replies are not streamed: the child sees nothing until the output screen passes.
 *
 * No server-side refusal fallback on purpose (spec §12): in a children's product a declined
 * message is not retried on another model; the child gets the fallback copy instead.
 *
 * `messages.parse` throws when a response isn't valid JSON for the schema (a refusal with text,
 * a reply cut off at max_tokens). That is caught here and turned into a result, so only real
 * infrastructure failures (Anthropic.APIError: HTTP, network, timeout) reach the breaker.
 */

const TIMEOUT_MS = 20_000;

function tokens(usage: Anthropic.Usage) {
  return {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
}

/** Child text goes inside XML-ish tags for the screens; it must not be able to close them. */
function escapeTags(text: string): string {
  return text.replace(/</g, "‹").replace(/>/g, "›");
}

function toMessages(history: Turn[], text: string): Anthropic.MessageParam[] {
  return [
    ...history.map(
      (turn): Anthropic.MessageParam => ({
        role: turn.role === "child" ? "user" : "assistant",
        content: turn.text,
      }),
    ),
    { role: "user", content: text },
  ];
}

/** A transcript for the screens: the child's turns are data to classify, never instructions. */
function transcript(history: Turn[], text: string): string {
  const lines = history
    .slice(-4)
    .map((turn) => `${turn.role === "child" ? "Child" : "Guide"}: ${escapeTags(turn.text)}`);
  return [
    "<earlier_turns>",
    ...lines,
    "</earlier_turns>",
    "<latest_child_message>",
    escapeTags(text),
    "</latest_child_message>",
  ].join("\n");
}

/** Runs a parse call; a non-HTTP error (unparseable output) becomes `null` instead of a throw. */
async function parsed<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof Anthropic.APIError) throw error;
    return null;
  }
}

export function createAnthropicProvider(apiKey: string): GuideProvider {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

  return {
    name: "anthropic",

    async screenInput({ text, history }) {
      const response = await parsed(() =>
        client.messages.parse({
          model: SCREEN_MODEL,
          max_tokens: 1024,
          system: INPUT_SCREEN_PROMPT,
          messages: [{ role: "user", content: transcript(history, text) }],
          output_config: { effort: "low", format: zodOutputFormat(inputScreenSchema) },
        }),
      );
      // A refused or unreadable screen fails toward support: the child gets the safety reply
      // (helplines, "talk to an adult you trust") and the chat is flagged.
      if (!response || response.stop_reason === "refusal" || !response.parsed_output) {
        const usage = response ? tokens(response.usage) : null;
        return {
          route: "safety",
          usage: { screenInput: usage?.input ?? 0, screenOutput: usage?.output ?? 0 },
        };
      }
      const usage = tokens(response.usage);
      return {
        route: response.parsed_output.route,
        usage: { screenInput: usage.input, screenOutput: usage.output },
      };
    },

    async reply({ text, history, context, signal }): Promise<MainResult> {
      const response = await parsed(() =>
        client.messages.parse(
          {
            model: MAIN_MODEL,
            max_tokens: 2048,
            // The frozen system prompt (with the topic material) is the cached prefix.
            system: [
              { type: "text", text: GUIDE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
            ],
            // Per-request context goes after the child's message as a system message, so the
            // system prompt never changes between requests.
            messages: [...toMessages(history, text), { role: "system", content: context }],
            output_config: { effort: "low", format: zodOutputFormat(mainReplySchema) },
          },
          { signal },
        ),
      );
      if (!response) return { kind: "refused", usage: {}, model: MAIN_MODEL };
      const usage = tokens(response.usage);
      const counted = {
        mainInput: usage.input,
        mainOutput: usage.output,
        mainCacheRead: usage.cacheRead,
        mainCacheWrite: usage.cacheWrite,
      };
      if (response.stop_reason === "refusal" || !response.parsed_output) {
        return { kind: "refused", usage: counted, model: MAIN_MODEL };
      }
      return { kind: "ok", reply: response.parsed_output, usage: counted, model: MAIN_MODEL };
    },

    async screenOutput({ reply, childText, context }) {
      const response = await parsed(() =>
        client.messages.parse({
          model: SCREEN_MODEL,
          max_tokens: 1024,
          system: OUTPUT_SCREEN_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                "<context>",
                context,
                "</context>",
                "<child_message>",
                escapeTags(childText),
                "</child_message>",
                "<guide_reply>",
                escapeTags(reply),
                "</guide_reply>",
              ].join("\n"),
            },
          ],
          output_config: { effort: "low", format: zodOutputFormat(outputScreenSchema) },
        }),
      );
      const usage = response ? tokens(response.usage) : null;
      const verdict = response?.parsed_output;
      // Unreadable or refused: the reply is held back.
      const pass = !!response && response.stop_reason !== "refusal" && !!verdict && verdict.pass;
      return {
        pass,
        problem: verdict?.problem ?? "unreadable",
        usage: { screenInput: usage?.input ?? 0, screenOutput: usage?.output ?? 0 },
      };
    },
  };
}
