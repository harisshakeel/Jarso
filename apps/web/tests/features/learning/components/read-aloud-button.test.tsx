import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pickVoice,
  READ_ALOUD_RATE,
  ReadAloudButton,
  type SpeechVoice,
} from "@/features/learning/components/read-aloud-button";

/** A stand-in for the browser's speech synthesis that remembers what it was asked to say. */
const spoken = vi.hoisted(() => ({ texts: [] as string[], cancels: 0, langs: [] as string[] }));

class FakeUtterance {
  lang = "";
  rate = 1;
  pitch = 1;
  voice: SpeechVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
const fakeSynth = {
  speaking: false,
  speak: vi.fn((u: FakeUtterance) => {
    spoken.texts.push(u.text);
    spoken.langs.push(u.lang);
  }),
  cancel: vi.fn(() => {
    spoken.cancels += 1;
  }),
};

function withSpeech(on: boolean) {
  Object.defineProperty(window, "speechSynthesis", {
    value: on ? fakeSynth : undefined,
    configurable: true,
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    value: on ? FakeUtterance : undefined,
    configurable: true,
  });
}

beforeEach(() => {
  spoken.texts = [];
  spoken.langs = [];
  spoken.cancels = 0;
  vi.clearAllMocks();
  document.documentElement.lang = "en-GB";
});
afterEach(() => {
  cleanup();
  withSpeech(false);
});

describe("ReadAloudButton", () => {
  it("reads the words in the page's language and turns into Stop while it speaks", () => {
    withSpeech(true);
    render(<ReadAloudButton text="Spend is the cash you hold." />);
    const button = screen.getByRole("button", { name: "Read aloud" });
    fireEvent.click(button);
    expect(spoken.texts).toEqual(["Spend is the cash you hold."]);
    expect(spoken.langs).toEqual(["en-GB"]);
    expect(screen.getByRole("button", { name: "Stop" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(spoken.cancels).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeVisible();
  });

  it("stops the old reading when the words change, and when it unmounts", () => {
    withSpeech(true);
    const { rerender, unmount } = render(<ReadAloudButton text="One" />);
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    const before = spoken.cancels;
    rerender(<ReadAloudButton text="Two" />);
    expect(spoken.cancels).toBeGreaterThan(before);
    expect(screen.getByRole("button", { name: "Read aloud" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    const beforeUnmount = spoken.cancels;
    unmount();
    expect(spoken.cancels).toBeGreaterThan(beforeUnmount);
  });

  it("is absent in a browser that cannot speak", () => {
    withSpeech(false);
    render(<ReadAloudButton text="Quiet" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reads slower than the browser's default, in a calm voice on the device", () => {
    withSpeech(true);
    const voices: SpeechVoice[] = [
      { name: "Google UK English Female", lang: "en-GB", localService: false },
      { name: "Bubbles", lang: "en-US", localService: true },
      { name: "Daniel", lang: "en-GB", localService: true },
    ];
    const said: FakeUtterance[] = [];
    Object.assign(fakeSynth, { getVoices: () => voices });
    fakeSynth.speak.mockImplementationOnce((u: FakeUtterance) => {
      said.push(u);
    });
    render(<ReadAloudButton text="Save is for later." />);
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(said[0]?.rate).toBe(READ_ALOUD_RATE);
    expect(READ_ALOUD_RATE).toBeLessThan(0.95);
    expect(said[0]?.voice?.name).toBe("Daniel");
    Reflect.deleteProperty(fakeSynth, "getVoices");
  });
});

describe("pickVoice", () => {
  const v = (name: string, lang: string, localService = true): SpeechVoice => ({
    name,
    lang,
    localService,
  });

  it("prefers the page's accent, then a better-quality voice, then the liked list", () => {
    expect(
      pickVoice([v("Samantha", "en-US"), v("Daniel", "en-GB"), v("Moira", "en-IE")], "en-GB")?.name,
    ).toBe("Daniel");
    expect(pickVoice([v("Daniel", "en-GB"), v("Serena (Premium)", "en-GB")], "en-GB")?.name).toBe(
      "Serena (Premium)",
    );
    expect(pickVoice([v("Microsoft Zira", "en-US"), v("Karen", "en-AU")], "en-GB")?.name).toBe(
      "Karen",
    );
  });

  it("never sends the words away, never picks a novelty or non-English voice", () => {
    expect(pickVoice([v("Google UK English Female", "en-GB", false)], "en-GB")).toBeNull();
    expect(pickVoice([v("Bad News", "en-US"), v("Zarvox", "en-US")], "en-GB")).toBeNull();
    expect(pickVoice([v("Thomas", "fr-FR")], "en-GB")).toBeNull();
    expect(pickVoice([], "en-GB")).toBeNull();
  });
});
