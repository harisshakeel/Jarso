import { requireOptionalNativeModule } from "expo";

type CameraModule = typeof import("expo-camera");

let loaded: CameraModule | null | undefined;

/**
 * `expo-camera`, or null when this build has no camera module (a development build made before
 * the module was added). expo-camera throws on import without its native side, so it is only
 * required once the native module is known to be there; without it the child types the code.
 */
export function loadCamera(): CameraModule | null {
  if (loaded !== undefined) return loaded;
  try {
    loaded = requireOptionalNativeModule("ExpoCamera")
      ? (require("expo-camera") as CameraModule)
      : null;
  } catch {
    loaded = null;
  }
  return loaded;
}
