import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MAIN_EFFORT, MAIN_MODEL, SCREEN_MODEL } from "./cost";
import { GUIDE_SYSTEM_PROMPT, INPUT_SCREEN_PROMPT, OUTPUT_SCREEN_PROMPT } from "./prompts";
import {
  type GuideProvider,
  inputScreenSchema,
  MAX_TOOL_ROUNDS,
  type MainResult,
  mainReplySchema,
  outputScreenSchema,
  type Toolbox,
  type Turn,
  withUsage,
} from "./provider";

/**
 * The only place that talks to Claude (spec §5.2, ADR 0011). Jarso's answers come from Claude
 * Sonnet 5.5 at low effort in a short tool loop (read-only look-ups, at most MAX_TOOL_ROUNDS
 * rounds); both screens run on Claude Haiku 5.5. Structured outputs keep every response in a
 * known shape. Replies are not streamed: the child sees nothing until the output screen passes.
 *
 * No server-side refusal fallback on purpose (spec §12): in a children's product a declined
 * message is not retried on another model; the child gets the fallback copy instead.
 *
 * `messages.parse` throws when a response isn't valid JSON for the schema (a refusal with text,
 * a reply cut off at max_tokens). That is caught here and turned into a result, so only real
 * infrastructure failures (Anthropic.APIError: HTTP, network, timeout) reach the breaker. The
 * main loop parses its final answer itself, for the same reason.
 */

const TIMEOUT_MS = 20_000;

/** The JSON schema the final answer must match; built once so every request is identical. */
const replyFormat = zodOutputFormat(mainReplySchema);

/**
 * Appended before the last round, so the answer comes from what was looked up instead of a
 * look-up that can't run. A system message after the results keeps the history append-only.
 */
const LAST_ROUND = "No more look-ups this turn. Answer now with what you have.";

/**
 * The toolbox's specs as Claude tools. Strict, so arguments always match the schema; the
 * runners still validate them.
 */
function toTools(tools: Toolbox): Anthropic.Tool[] {
  return tools.specs.map((spec) => ({
    name: spec.name,
    description: spec.description,
    input_schema: spec.inputSchema as Anthropic.Tool.InputSchema,
    strict: true,
  }));
}

/** The final answer's JSON, checked against the schema; null when it can't be read. */
function readReply(content: Anthropic.ContentBlock[]) {
  const text = content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  if (!text) return null;
  try {
    const parsed = mainReplySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

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

    async screenInput({ text, history, signal }) {
      const response = await parsed(() =>
        client.messages.parse(
          {
            model: SCREEN_MODEL,
            max_tokens: 1024,
            system: INPUT_SCREEN_PROMPT,
            messages: [{ role: "user", content: transcript(history, text) }],
            output_config: { effort: "low", format: zodOutputFormat(inputScreenSchema) },
          },
          { signal },
        ),
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

    async reply({ text, history, context, tools, signal }): Promise<MainResult> {
      // Per-request context goes after the child's message as a system message, so the system
      // prompt never changes between requests. Within the turn the loop only appends: each
      // response's full content (thinking blocks included) goes back unchanged.
      const messages: Anthropic.MessageParam[] = [
        ...toMessages(history, text),
        { role: "system", content: context },
      ];
      const counted = { mainInput: 0, mainOutput: 0, mainCacheRead: 0, mainCacheWrite: 0 };
      try {
        for (let round = 0; ; round++) {
          const response = await client.messages.create(
            {
              model: MAIN_MODEL,
              max_tokens: 4096,
              // Tools render first, then the frozen system prompt: one cached prefix.
              tools: toTools(tools),
              system: [
                { type: "text", text: GUIDE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
              ],
              messages,
              // The rounds of one turn share their growing prefix through the cache too.
              cache_control: { type: "ephemeral" },
              // Sonnet 5.5 can't switch thinking off; low effort keeps it short.
              thinking: { type: "adaptive" },
              output_config: { effort: MAIN_EFFORT, format: replyFormat },
            },
            { signal },
          );
          const usage = tokens(response.usage);
          counted.mainInput += usage.input;
          counted.mainOutput += usage.output;
          counted.mainCacheRead += usage.cacheRead;
          counted.mainCacheWrite += usage.cacheWrite;
          if (response.stop_reason === "refusal") {
            return { kind: "refused", usage: counted, model: MAIN_MODEL };
          }

          const calls = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
          );
          if (response.stop_reason === "tool_use" && calls.length > 0) {
            // Out of rounds even after the notice: no answer rather than an unbounded loop.
            if (round >= MAX_TOOL_ROUNDS) {
              return { kind: "refused", usage: counted, model: MAIN_MODEL };
            }
            messages.push({ role: "assistant", content: response.content });
            const results = await Promise.all(
              calls.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
                const result = await tools.run(call.name, call.input);
                return {
                  type: "tool_result",
                  tool_use_id: call.id,
                  content: result.content,
                  ...(result.isError ? { is_error: true } : {}),
                };
              }),
            );
            // Every result in one message, so Claude keeps making parallel calls.
            messages.push({ role: "user", content: results });
            if (round === MAX_TOOL_ROUNDS - 1) {
              messages.push({ role: "system", content: LAST_ROUND });
            }
            continue;
          }

          const reply = response.stop_reason === "end_turn" ? readReply(response.content) : null;
          if (!reply) return { kind: "refused", usage: counted, model: MAIN_MODEL };
          return { kind: "ok", reply, usage: counted, model: MAIN_MODEL };
        }
      } catch (error) {
        throw withUsage(error, counted);
      }
    },

    async screenOutput({ reply, childText, context, signal }) {
      const response = await parsed(() =>
        client.messages.parse(
          {
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
          },
          { signal },
        ),
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
