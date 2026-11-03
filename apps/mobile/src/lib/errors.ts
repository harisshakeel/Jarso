import { GENERIC_FAILURE, isAppError } from "@jarso/core/lib";
import { offlineCopy } from "@jarso/core/offline";
import { getNetworkStateAsync } from "expo-network";

/** The line a child reads for an error: an AppError's safe message, otherwise the generic one. */
export function toUserMessage(error: unknown): string {
  return isAppError(error) ? error.message : GENERIC_FAILURE;
}

async function isOffline(): Promise<boolean> {
  try {
    const state = await getNetworkStateAsync();
    return state.isConnected === false || state.isInternetReachable === false;
  } catch {
    return false;
  }
}

/**
 * The line for a failed action. When Jarso could not be reached it says whether that is the
 * phone's connection (offline) or the wait (slow), in core's calm wording; otherwise as
 * `toUserMessage`.
 */
export async function actionErrorMessage(error: unknown): Promise<string> {
  if (isAppError(error) && error.code === "UNAVAILABLE") {
    return (await isOffline()) ? offlineCopy.offline : offlineCopy.slow;
  }
  return toUserMessage(error);
}
