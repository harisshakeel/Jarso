"use client";

import type {
  GuideContextRef,
  GuideProposal,
  SuggestionCard,
  ThreadMessage,
} from "@jarso/core/guide";
import { guideCopy, guideUi, MAX_MESSAGE_LENGTH, sendGuideTurn } from "@jarso/core/guide";
import {
  BookOpenIcon,
  CalendarDaysIcon,
  CoinsIcon,
  ExternalLinkIcon,
  PiggyBankIcon,
  ReceiptIcon,
  SendHorizontalIcon,
  SparklesIcon,
  TargetIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { JarsoEyes } from "@/components/brand";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { newId, runOnline } from "@/features/offline";
import { cn } from "@/lib";
import { GuideBubble } from "./guide-reply";
import { PhotoPriceButton } from "./photo-price-button";
import { ThinkingBubble } from "./thinking-bubble";
import { VoiceButton, type VoiceState } from "./voice-button";

/** The server's turn deadline is 45 s; this leaves room for its reply or its slow notice. */
const TURN_TIMEOUT_MS = 52_000;

/** An icon per starter question (`guideCopy.suggestionCards`). */
const cardIcons: Record<SuggestionCard["key"], typeof CoinsIcon> = {
  jars: CoinsIcon,
  spent: ReceiptIcon,
  allowance: CalendarDaysIcon,
  saving: PiggyBankIcon,
  goal: TargetIcon,
  learning: BookOpenIcon,
};

export type Kid = { id: string; nickname: string };

/** A stored chat to pick up again: its id, how many turns are left, and its messages so far. */
export type ReopenedChat = {
  conversationId: string;
  turnsLeft: number;
  messages: ThreadMessage[];
  /** For a parent's chat: the child it is about (fixed for the rest of the chat). */
  kid?: Kid;
};

export type GuideThreadProps = {
  /** The intro card comes first for a child who has never chatted. */
  introNeeded?: boolean;
  /** Questions to start with, from what the child has (no allowance, no allowance question). */
  suggestions?: string[];
  /** A parent asks about one of their children; the child asks about themselves. */
  audience?: "child" | "parent";
  /** The parent's children Jarso is on for; the first is picked to start. */
  kids?: Kid[];
  /** The name of the person asking, for the greeting over an empty chat on the page. */
  person?: string;
  /** A chat being continued (the Jarso page). */
  reopened?: ReopenedChat;
  /** The full-page chat, for the "Open" link beside the title of the Home window. */
  openHref?: Route;
  /** The window on Home keeps its card look; the page fills the height. */
  variant?: "card" | "page";
  /** The page's way to refresh its list of chats once a new chat has its first reply. */
  onChatStarted?: (conversationId: string) => void;
  /**
   * What a child's chat is about: Home by default, or the lesson step on screen when Jarso is
   * opened from the floating buddy during a lesson (keys only; the server looks up the text).
   */
  context?: GuideContextRef;
};

/** Spoken words land after whatever was typed, within the box's limit. */
function joinSpoken(before: string, spoken: string): string {
  const joined = before.trim() ? `${before.trimEnd()} ${spoken}` : spoken;
  return joined.slice(0, MAX_MESSAGE_LENGTH);
}

/**
 * One chat with Jarso (FR07, ADR 0011): the title, the AI disclosure, the messages, the status
 * bubble while Jarso works, and the composer. Jarso answers from the child's own jars,
 * allowance, history and learning, looked up only when asked, and the reply appears once it
 * has passed the output screen. Shared by the Ask Jarso window on Home and the Jarso page,
 * where an empty chat is Jarso's face, a greeting and the composer in the middle of the page.
 */
export function GuideThread({
  introNeeded = false,
  suggestions = [],
  audience = "child",
  kids = [],
  person = "",
  reopened,
  openHref,
  variant = "card",
  onChatStarted,
  context,
}: GuideThreadProps) {
  const lesson = context?.entry === "step" || context?.entry === "why";
  const [introSeen, setIntroSeen] = useState(!introNeeded);
  const [kidId, setKidId] = useState(reopened?.kid?.id ?? kids[0]?.id ?? null);
  const kid = reopened?.kid ?? kids.find((k) => k.id === kidId) ?? kids[0] ?? null;
  const forParent = audience === "parent" && kid !== null;
  const copy = forParent
    ? {
        title: guideCopy.parent.title(kid.nickname),
        disclosure: guideCopy.parent.disclosure(kid.nickname),
        placeholder: guideCopy.parent.placeholder(kid.nickname),
        suggestions: guideCopy.parent.suggestions(kid.nickname),
        greeting: guideCopy.greeting.parent(person, kid.nickname),
        cards: guideCopy.suggestionCards.parent(kid.nickname),
      }
    : {
        title: lesson ? guideCopy.lesson.title : guideCopy.homeTitle,
        disclosure: guideCopy.disclosure,
        placeholder: lesson ? guideCopy.lesson.placeholder : guideCopy.homePlaceholder,
        suggestions,
        greeting: lesson ? guideCopy.lesson.greeting : guideCopy.greeting.child(person),
        cards: guideCopy.suggestionCards.child,
      };
  const [conversationId, setConversationId] = useState<string | null>(
    reopened?.conversationId ?? null,
  );
  const [messages, setMessages] = useState<ThreadMessage[]>(reopened?.messages ?? []);
  const [started, setStarted] = useState<string | null>(null);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(reopened?.turnsLeft ?? null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [full, setFull] = useState(reopened ? reopened.turnsLeft === 0 : false);
  const [focused, setFocused] = useState(false);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Bumped on every new chat, so a reply that lands after it is dropped.
  const generation = useRef(0);
  // Sending the same text again after a failure reuses its id, so a reply that was saved but
  // lost on the way back is shown, not asked again.
  const unanswered = useRef<{ text: string; id: string } | null>(null);
  // Replies that arrived in this session are typed out; reopened ones show whole.
  const live = useRef(new Set<string>());
  // What was typed before the microphone started, so spoken words land after it.
  const typedBefore = useRef("");
  const page = variant === "page";
  const empty = messages.length === 0 && !pending;

  // Keep the newest message and the status line in view. On the page only the message list
  // scrolls (the History button and the composer stay put), and it glides; on Home the window
  // brings the window into view.
  const scrollToEnd = useCallback(() => {
    const box = scroller.current;
    if (page && box) {
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      box.scrollTo?.({ top: box.scrollHeight, behavior: still ? "auto" : "smooth" });
      return;
    }
    listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [page]);
  useEffect(() => {
    if (messages.length > 0 || pending) scrollToEnd();
  }, [messages, pending, scrollToEnd]);
  // While a reply types itself out, stay at the bottom unless the reader has scrolled up.
  useEffect(() => {
    const box = scroller.current;
    if (!page || !box || typeof MutationObserver === "undefined") return;
    let pinned = true;
    const onScroll = () => {
      pinned = box.scrollHeight - box.scrollTop - box.clientHeight < 64;
    };
    const follow = new MutationObserver(() => {
      if (pinned) box.scrollTop = box.scrollHeight;
    });
    box.addEventListener("scroll", onScroll, { passive: true });
    follow.observe(box, { childList: true, subtree: true, characterData: true });
    return () => {
      box.removeEventListener("scroll", onScroll);
      follow.disconnect();
    };
  }, [page]);

  // "Change something" on a card Jarso prepared: a short line in the box to finish and send.
  function changeDraft(line: string) {
    setText(line);
    input.current?.focus();
  }

  function newChat() {
    generation.current += 1;
    setConversationId(null);
    setMessages([]);
    setTurnsLeft(null);
    setText("");
    setError(null);
    setFull(false);
    unanswered.current = null;
    input.current?.focus();
  }

  /** `offer`: a goal from a photo's price, shown under Jarso's answer if it makes none itself. */
  function ask(question: string, offer?: GuideProposal) {
    if (!question || pending) return;
    setError(null);
    setStatus(null);
    if (unanswered.current?.text !== question) {
      // Minted on submit, never in render, so server and client HTML match.
      unanswered.current = { text: question, id: newId() };
    }
    const clientMessageId = unanswered.current.id;
    const started = generation.current;
    const firstTurn = conversationId === null;
    startTransition(async () => {
      const result = await runOnline(
        () =>
          sendGuideTurn(
            {
              clientMessageId,
              conversationId,
              context: forParent
                ? { entry: "parent", childId: kid.id }
                : (context ?? { entry: "home" }),
              text: question,
            },
            (line) => {
              if (started === generation.current) setStatus(line);
            },
          ),
        { timeoutMs: TURN_TIMEOUT_MS },
      );
      if (started !== generation.current) return;
      // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
      startTransition(() => {
        setStatus(null);
        if (!result.ok) {
          if (result.error.code === "CONFLICT") setFull(true);
          setError({
            code: result.error.code,
            message:
              result.error.code === "VALIDATION"
                ? (result.error.fieldErrors?.text?.[0] ?? result.error.message)
                : result.error.code === "INTERNAL"
                  ? guideCopy.routes.unavailable
                  : result.error.message,
          });
          return;
        }
        unanswered.current = null;
        const reply =
          result.data.reply.proposal || !offer
            ? result.data.reply
            : { ...result.data.reply, proposal: offer };
        setConversationId(result.data.conversationId);
        setTurnsLeft(result.data.turnsLeft);
        if (result.data.turnsLeft === 0) setFull(true);
        setMessages((current) => {
          const replyId = reply.messageId ?? `guide-${current.length}`;
          live.current.add(replyId);
          return [
            ...current,
            { id: `child-${current.length}`, from: "child", text: question },
            { id: replyId, from: "guide", reply },
          ];
        });
        setText("");
        if (firstTurn) setStarted(result.data.conversationId);
      });
    });
  }

  // The page learns about a started chat only after the reply has been shown: inside the
  // transition the page's address change would hold the reply back until the server had
  // re-rendered the thread, and the child would stare at the status bubble meanwhile. It is told
  // once per chat: a parent re-render with a new callback must not move the page again.
  const chatStarted = useEffectEvent((id: string) => onChatStarted?.(id));
  useEffect(() => {
    if (started) chatStarted(started);
  }, [started]);

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(text.trim());
  }

  const voiceLine =
    voice === "listening"
      ? guideCopy.voice.listening
      : voice === "failed"
        ? guideCopy.voice.failed
        : "";

  const composer = full ? (
    <div className="grid gap-2">
      <p className="text-ink-2">{guideCopy.chatFull}</p>
      <Button variant="outline" onClick={newChat} className="w-fit">
        {guideCopy.newChat}
      </Button>
    </div>
  ) : (
    <form onSubmit={submit} className="grid gap-2">
      <label htmlFor="ask-jarso-question" className="sr-only">
        {guideUi.questionLabel}
      </label>
      <div
        className={cn(
          "grid gap-1 rounded-2xl border border-hairline-strong bg-card p-2 transition-colors duration-150 focus-within:border-primary",
          page && empty && "shadow-raised",
        )}
      >
        <textarea
          id="ask-jarso-question"
          ref={input}
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={page && empty ? 3 : 2}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={copy.placeholder}
          className="w-full resize-none bg-transparent px-2 py-1.5 outline-none"
          aria-describedby="ask-jarso-count"
        />
        <div className="flex items-center justify-between gap-3">
          <span id="ask-jarso-count" className="px-2 text-ink-2 text-sm">
            {guideUi.count(text.length, MAX_MESSAGE_LENGTH)}
            {turnsLeft !== null && turnsLeft <= 3 ? guideUi.turnsLeft(turnsLeft) : ""}
          </span>
          <div className="flex items-center gap-2">
            {messages.length > 0 && !pending && !page ? (
              <Button type="button" variant="ghost" onClick={newChat}>
                {guideUi.newChat}
              </Button>
            ) : null}
            {forParent ? null : (
              <PhotoPriceButton
                compact
                disabled={pending}
                onResult={(result) => {
                  if (result.found) ask(result.text, result.proposal);
                }}
              />
            )}
            <VoiceButton
              disabled={pending}
              onStart={() => {
                typedBefore.current = text;
              }}
              onInterim={(spoken) => setText(joinSpoken(typedBefore.current, spoken))}
              onFinal={(spoken) => {
                setText(joinSpoken(typedBefore.current, spoken));
                input.current?.focus();
              }}
              onState={setVoice}
            />
            {/* Not a keycap: Home keeps its one keycap for the next step. */}
            <Button type="submit" size="lg" loading={pending} disabled={!text.trim()}>
              <SendHorizontalIcon aria-hidden />
              {guideUi.ask}
            </Button>
          </div>
        </div>
      </div>
      <p role="status" className={cn("px-2 text-ink-2 text-sm", !voiceLine && "sr-only")}>
        {voiceLine}
      </p>
    </form>
  );

  const picker =
    forParent && kids.length > 1 && !reopened ? (
      <fieldset
        className={cn("flex flex-wrap items-center gap-2", page && empty && "justify-center")}
      >
        <legend className="sr-only">{guideCopy.parent.pick}</legend>
        <span className="text-ink-2 text-sm">{guideCopy.parent.pick}</span>
        {kids.map((k) => (
          <Button
            key={k.id}
            type="button"
            variant={k.id === kid.id ? "secondary" : "outline"}
            aria-pressed={k.id === kid.id}
            disabled={pending}
            onClick={() => {
              if (k.id === kid.id) return;
              setKidId(k.id);
              newChat();
            }}
          >
            {k.nickname}
          </Button>
        ))}
      </fieldset>
    ) : null;

  const intro = (
    <div className="grid gap-3 self-start rounded-2xl bg-secondary p-5 text-left">
      <p className="flex items-center gap-2 font-bold">
        <JarsoEyes size="sm" />
        {guideUi.beforeWeStart}
      </p>
      {guideCopy.intro.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <Button
        size="lg"
        className="w-fit"
        onClick={() => {
          setIntroSeen(true);
          requestAnimationFrame(() => input.current?.focus());
        }}
      >
        {guideCopy.introButton}
      </Button>
    </div>
  );

  const cards = (
    <ul aria-label={guideUi.tryThese} className="grid gap-2 sm:grid-cols-2">
      {copy.suggestions.map((question) => {
        const card = copy.cards.find((c) => c.question === question);
        const Icon = card ? cardIcons[card.key] : SparklesIcon;
        return (
          <li key={question}>
            <button
              type="button"
              onClick={() => {
                setText(question);
                ask(question);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-hairline bg-card px-4 py-3 text-left transition-colors duration-150 hover:border-hairline-strong hover:bg-muted focus-visible:border-primary focus-visible:outline-none"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="grid gap-0.5">
                <span className="font-semibold">{question}</span>
                {card?.hint ? (
                  <span aria-hidden className="text-ink-2 text-sm">
                    {card.hint}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  // The page's empty chat: Jarso's face, a greeting and the composer in the middle.
  if (page && empty) {
    return (
      <section
        aria-labelledby="ask-jarso"
        className="relative flex h-full flex-col items-center justify-center-safe gap-6 overflow-y-auto py-6 text-center"
      >
        <div
          aria-hidden
          className="-z-10 pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,var(--secondary)_0%,transparent_65%)] opacity-70"
        />
        <h2 id="ask-jarso" className="sr-only">
          {copy.title}
        </h2>
        <JarsoEyes size="xl" look={focused ? "down" : "ahead"} />
        <div className="grid gap-2">
          <p className="text-balance text-h2">{copy.greeting}</p>
          <p className="text-ink-2 text-sm">{copy.disclosure}</p>
        </div>
        <div className="grid w-full max-w-[42rem] gap-4 text-left">
          {picker}
          {!introSeen ? (
            intro
          ) : (
            <>
              <FormError error={error ?? undefined} />
              {composer}
              {cards}
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="ask-jarso"
      className={cn(
        "grid gap-4",
        // The page keeps the empty chat's centred column, so nothing widens once a chat starts.
        page && "mx-auto h-full min-h-0 w-full max-w-[42rem] grid-rows-[auto_1fr_auto]",
      )}
    >
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id="ask-jarso" className="flex items-center gap-2 text-h3">
            {page ? (
              <JarsoEyes size="md" />
            ) : (
              <SparklesIcon aria-hidden className="size-5 text-accent-text" />
            )}
            {copy.title}
          </h2>
          {openHref ? (
            <Link
              href={openHref}
              className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold text-primary text-sm underline-offset-4 hover:underline"
            >
              {guideUi.open}
              <ExternalLinkIcon aria-hidden className="size-4" />
            </Link>
          ) : null}
        </div>
        <p className="text-ink-2 text-sm">{copy.disclosure}</p>
      </div>
      {picker}

      {!introSeen ? (
        intro
      ) : (
        <>
          <div
            ref={scroller}
            className={cn(
              "grid content-start gap-3",
              page &&
                "-mx-2 min-h-0 overflow-y-auto overscroll-contain px-2 pt-4 pb-2 [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem)]",
            )}
          >
            {messages.length > 0 || pending ? (
              <ol aria-label={guideUi.chatLabel} aria-live="polite" className="grid gap-3">
                {messages.map((message) =>
                  message.from === "child" ? (
                    <li
                      key={message.id}
                      className="rise-in ml-8 max-w-[85%] justify-self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground"
                    >
                      <span className="sr-only">{guideUi.you}</span>
                      {message.text}
                    </li>
                  ) : (
                    <li key={message.id} className="rise-in">
                      <GuideBubble
                        reply={message.reply}
                        live={live.current.has(message.id)}
                        onTyped={scrollToEnd}
                        onChangeDraft={changeDraft}
                      />
                    </li>
                  ),
                )}
                {pending && unanswered.current ? (
                  <li className="rise-in ml-8 max-w-[85%] justify-self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
                    <span className="sr-only">{guideUi.you}</span>
                    {unanswered.current.text}
                  </li>
                ) : null}
              </ol>
            ) : null}
            {pending ? <ThinkingBubble status={status} size={page ? "lg" : "md"} /> : null}
            {empty ? cards : null}
            <div ref={listEnd} />
          </div>

          <div className={cn("grid gap-3", page && "pt-1 pb-1")}>
            <FormError error={error ?? undefined} />
            {composer}
          </div>
        </>
      )}
    </section>
  );
}
