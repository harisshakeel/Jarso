import { type EmergencyResult, emergencySchema } from "@jarso/core/requests";
import { AskReasonFlow } from "./ask-reason-flow";
import { useCreateEmergency } from "./use-request-mutations";

/**
 * "Ask for extra" (FR15): ask the parent for extra money and say what it's for. Nothing is
 * reserved; if the parent says yes it lands in Spend when they hand it over. Always sent.
 */
export function AskExtraSheet({ onClose }: { onClose: () => void }) {
  const send = useCreateEmergency();
  return (
    <AskReasonFlow<EmergencyResult>
      kind="emergency"
      onClose={onClose}
      send={send}
      schema={emergencySchema}
      refusal={() => null}
      limitMinor={() => null}
      guess={false}
    />
  );
}
