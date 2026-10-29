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
 */

const TIMEOUT_MS = 20_000;

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
};

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
    .map((turn) => `${turn.role === "child" ? "Child" : "Guide"}: ${turn.text}`);
  return [
    "<earlier_turns>",
    ...lines,
    "</earlier_turns>",
    "<latest_child_message>",
    text,
    "</latest_child_message>",
  ].join("\n");
}

export function createAnthropicProvider(apiKey: string): GuideProvider {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });

  return {
    name: "anthropic",

    async screenInput({ text, history }) {
      const response = await client.messages.parse({
        model: SCREEN_MODEL,
        max_tokens: 1024,
        system: INPUT_SCREEN_PROMPT,
        messages: [{ role: "user", content: transcript(history, text) }],
        output_config: { effort: "low", format: zodOutputFormat(inputScreenSchema) },
      });
      const usage = response.usage as Usage;
      // A refused or unreadable screen fails closed: the message is treated as unsafe.
      const route =
        response.stop_reason === "refusal" || !response.parsed_output
          ? "unsafe"
          : response.parsed_output.route;
      return {
        route,
        usage: { screenInput: usage.input_tokens, screenOutput: usage.output_tokens },
      };
    },

    async reply({ text, history, context }): Promise<MainResult> {
      const response = await client.messages.parse({
        model: MAIN_MODEL,
        max_tokens: 2048,
        system: [{ type: "text", text: GUIDE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        // Per-request context goes after the child's message as a system message, so the cached
        // prefix (system prompt and earlier turns) never changes.
        messages: [...toMessages(history, text), { role: "system", content: context }],
        output_config: { effort: "low", format: zodOutputFormat(mainReplySchema) },
      });
      const usage = response.usage as Usage;
      const tokens = {
        mainInput: usage.input_tokens,
        mainOutput: usage.output_tokens,
        mainCacheRead: usage.cache_read_input_tokens ?? 0,
        mainCacheWrite: usage.cache_creation_input_tokens ?? 0,
      };
      if (response.stop_reason === "refusal" || !response.parsed_output) {
        return { kind: "refused", usage: tokens, model: MAIN_MODEL };
      }
      return { kind: "ok", reply: response.parsed_output, usage: tokens, model: MAIN_MODEL };
    },

    async screenOutput({ reply, childText, context }) {
      const response = await client.messages.parse({
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
              childText,
              "</child_message>",
              "<guide_reply>",
              reply,
              "</guide_reply>",
            ].join("\n"),
          },
        ],
        output_config: { effort: "low", format: zodOutputFormat(outputScreenSchema) },
      });
      const usage = response.usage as Usage;
      const parsed = response.parsed_output;
      const pass = response.stop_reason !== "refusal" && !!parsed && parsed.pass;
      return {
        pass,
        problem: parsed?.problem ?? "unreadable",
        usage: { screenInput: usage.input_tokens, screenOutput: usage.output_tokens },
      };
    },
  };
}
