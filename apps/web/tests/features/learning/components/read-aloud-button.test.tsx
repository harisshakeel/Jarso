import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadAloudButton } from "@/features/learning/components/read-aloud-button";

/** A stand-in for the browser's speech synthesis that remembers what it was asked to say. */
const spoken = vi.hoisted(() => ({ texts: [] as string[], cancels: 0, langs: [] as string[] }));

class FakeUtterance {
  lang = "";
  rate = 1;
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
});
