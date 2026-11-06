import AsyncStorage from "@react-native-async-storage/async-storage";
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useCallback, useEffect, useState } from "react";
import { logger } from "./logger";

export type SoundName = "coin" | "pop" | "cheer";

const KEY = "jarso.sound";

const SOURCES: Record<SoundName, number> = {
  coin: require("../../assets/sounds/coin.wav"),
  pop: require("../../assets/sounds/pop.wav"),
  cheer: require("../../assets/sounds/cheer.wav"),
};

// The saved setting, kept here so `playSound` stays synchronous. Null until first read; sound
// counts as on until then (the default), and `playSound` warms it.
let soundOn: boolean | null = null;
const players = new Map<SoundName, AudioPlayer>();
const listeners = new Set<(on: boolean) => void>();

// Bumped by every `setSoundOn`, so a slower storage read cannot overwrite a newer choice.
let version = 0;

/** Whether sound effects are on. Defaults to on when nothing is saved. */
export async function getSoundOn(): Promise<boolean> {
  const started = version;
  try {
    const saved = (await AsyncStorage.getItem(KEY)) !== "off";
    if (version === started) soundOn = saved;
  } catch (error) {
    logger.warn("sound setting unreadable", { error });
    soundOn ??= true;
  }
  return soundOn ?? true;
}

export async function setSoundOn(on: boolean): Promise<void> {
  version += 1;
  soundOn = on;
  for (const listener of listeners) listener(on);
  try {
    await AsyncStorage.setItem(KEY, on ? "on" : "off");
  } catch (error) {
    logger.warn("sound setting not saved", { error });
  }
}

let modeSet = false;

// Once, before the first clip: mix with whatever the child is listening to instead of taking
// audio focus and pausing it. A failure only costs that, so it is logged and never thrown.
function setModeOnce(): void {
  if (modeSet) return;
  modeSet = true;
  try {
    void Promise.resolve(setAudioModeAsync({ interruptionMode: "mixWithOthers" })).catch(
      (error) => {
        logger.warn("sound mode not set", { error });
      },
    );
  } catch (error) {
    logger.warn("sound mode not set", { error });
  }
}

function playNow(name: SoundName): void {
  setModeOnce();
  try {
    let player = players.get(name);
    if (!player) {
      player = createAudioPlayer(SOURCES[name]);
      players.set(name, player);
    }
    // seekTo is async on device: a rejection must not escape either.
    void Promise.resolve(player.seekTo(0)).catch((error) => {
      logger.warn("sound rewind failed", { name, error });
    });
    player.play();
  } catch (error) {
    logger.warn("sound failed", { name, error });
  }
}

/**
 * Plays a short effect. Fire and forget: never throws, silent while sound is off. While the saved
 * setting is still unknown it waits for it rather than guess.
 */
export function playSound(name: SoundName): void {
  if (soundOn === null) {
    void getSoundOn().then((on) => {
      if (on) playNow(name);
    });
    return;
  }
  if (soundOn) playNow(name);
}

/** The setting for a switch: current value and a setter that saves it. */
export function useSoundOn(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(soundOn ?? true);
  useEffect(() => {
    listeners.add(setOn);
    let live = true;
    void getSoundOn().then((value) => {
      if (live) setOn(value);
    });
    return () => {
      live = false;
      listeners.delete(setOn);
    };
  }, []);
  const set = useCallback((value: boolean) => {
    void setSoundOn(value);
  }, []);
  return [on, set];
}
