import type AsyncStorage from "@react-native-async-storage/async-storage";

type SoundModule = typeof import("@/lib/sound");

type Loaded = {
  sound: SoundModule;
  createAudioPlayer: jest.Mock;
  setAudioModeAsync: jest.Mock;
  storage: typeof AsyncStorage;
  logger: { warn: jest.Mock };
};

// The module keeps the setting and its players in module state: load a fresh copy per test.
function load(): Loaded {
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    loaded = {
      sound: require("@/lib/sound") as SoundModule,
      createAudioPlayer: require("expo-audio").createAudioPlayer as jest.Mock,
      setAudioModeAsync: require("expo-audio").setAudioModeAsync as jest.Mock,
      storage: require("@react-native-async-storage/async-storage"),
      logger: require("@/lib/logger").logger,
    };
  });
  return loaded as Loaded;
}

describe("sound", () => {
  it("plays when on", async () => {
    const { sound, createAudioPlayer } = load();
    await sound.getSoundOn();
    sound.playSound("coin");
    const player = createAudioPlayer.mock.results[0]?.value;
    expect(player.play).toHaveBeenCalledTimes(1);
    sound.playSound("coin");
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it("silent when off", async () => {
    const { sound, createAudioPlayer } = load();
    await sound.setSoundOn(false);
    sound.playSound("coin");
    expect(createAudioPlayer).not.toHaveBeenCalled();
    expect(createAudioPlayer.mock.results).toHaveLength(0); // so no player, so no play
  });

  it("stays silent while the saved off setting is still loading", async () => {
    const { sound, createAudioPlayer, storage } = load();
    await storage.setItem("jarso.sound", "off");
    sound.playSound("coin");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  it("plays after the saved on setting loads", async () => {
    const { sound, createAudioPlayer } = load();
    sound.playSound("coin");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(createAudioPlayer.mock.results[0]?.value.play).toHaveBeenCalledTimes(1);
  });

  it("never throws, and logs the failure", async () => {
    const { sound, createAudioPlayer, logger } = load();
    await sound.getSoundOn();
    jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    createAudioPlayer.mockImplementation(() => {
      throw new Error("no audio");
    });
    expect(() => sound.playSound("pop")).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("sets the audio mode once, mixing with the child's music", async () => {
    const { sound, setAudioModeAsync } = load();
    await sound.getSoundOn();
    sound.playSound("coin");
    sound.playSound("pop");
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenCalledWith({ interruptionMode: "mixWithOthers" });
  });

  it("still plays when the audio mode cannot be set", async () => {
    const { sound, createAudioPlayer, setAudioModeAsync, logger } = load();
    setAudioModeAsync.mockRejectedValueOnce(new Error("no session"));
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    await sound.getSoundOn();
    expect(() => sound.playSound("coin")).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(createAudioPlayer.mock.results[0]?.value.play).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("sound mode not set", expect.anything());
  });

  it("defaults to on", async () => {
    const { sound } = load();
    expect(await sound.getSoundOn()).toBe(true);
  });

  it("reads the saved setting", async () => {
    const { sound, storage } = load();
    await storage.setItem("jarso.sound", "off");
    expect(await sound.getSoundOn()).toBe(false);
  });
});
