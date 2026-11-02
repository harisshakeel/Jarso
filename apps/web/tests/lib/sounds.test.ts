import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  playCoins,
  playRight,
  playWrong,
  primeSounds,
  resetSoundsForTests,
  SOUNDS_KEY,
  setSoundsOn,
  soundsOn,
} from "@/lib/sounds";

/** A stand-in AudioContext that counts the oscillators it hands out. */
const made = vi.hoisted(() => ({ contexts: 0, oscillators: 0 }));

class FakeParam {
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class FakeNode {
  connect = vi.fn();
}
class FakeOscillator extends FakeNode {
  type = "sine";
  frequency = new FakeParam();
  start = vi.fn();
  stop = vi.fn();
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  constructor() {
    made.contexts += 1;
  }
  resume = vi.fn(async () => undefined);
  createOscillator() {
    made.oscillators += 1;
    return new FakeOscillator();
  }
  createGain() {
    return new FakeGain();
  }
}

beforeEach(() => {
  made.contexts = 0;
  made.oscillators = 0;
  window.localStorage.clear();
  resetSoundsForTests();
  Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true });
});
afterEach(() => {
  resetSoundsForTests();
});

describe("sounds", () => {
  it("are on until switched off, and the choice is kept in this browser", () => {
    expect(soundsOn()).toBe(true);
    setSoundsOn(false);
    expect(soundsOn()).toBe(false);
    expect(window.localStorage.getItem(SOUNDS_KEY)).toBe("off");
    setSoundsOn(true);
    expect(window.localStorage.getItem(SOUNDS_KEY)).toBeNull();
  });

  it("make no audio context before the person has touched the page", () => {
    primeSounds();
    playCoins();
    expect(made.contexts).toBe(0);
    expect(made.oscillators).toBe(0);
  });

  it("play after a gesture: coins are three taps, right two notes, wrong one", () => {
    primeSounds();
    window.dispatchEvent(new Event("pointerdown"));
    playCoins();
    expect(made.contexts).toBe(1);
    expect(made.oscillators).toBe(3);
    playRight();
    expect(made.oscillators).toBe(5);
    playWrong();
    expect(made.oscillators).toBe(6);
    // One context for the page, not one per sound.
    expect(made.contexts).toBe(1);
  });

  it("play nothing while switched off", () => {
    primeSounds();
    window.dispatchEvent(new Event("keydown"));
    setSoundsOn(false);
    playCoins();
    playRight();
    expect(made.oscillators).toBe(0);
  });

  it("is a no-op in a browser without Web Audio", () => {
    Object.defineProperty(window, "AudioContext", { value: undefined, configurable: true });
    primeSounds();
    window.dispatchEvent(new Event("pointerdown"));
    expect(() => playCoins()).not.toThrow();
    expect(made.oscillators).toBe(0);
  });
});
