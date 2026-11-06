import {
  takeOutLimit,
  type WithdrawalResult,
  withdrawalMessage,
  withdrawalSchema,
} from "@jarso/core/requests";
import { AskReasonFlow } from "./ask-reason-flow";
import { useCreateWithdrawal } from "./use-request-mutations";

/**
 * "Use savings": ask a parent for money from Save. Whether it is waiting or done at once is the
 * server's call; the flow celebrates the status it gets back. `over_available` and `over_cap`
 * send the child back to the amount with the web's message.
 */
export function TakeOutSheet({ onClose }: { onClose: () => void }) {
  const send = useCreateWithdrawal();
  return (
    <AskReasonFlow<WithdrawalResult>
      kind="withdrawal"
      onClose={onClose}
      send={send}
      schema={withdrawalSchema}
      refusal={(result, currency) =>
        result.status === "over_available" || result.status === "over_cap"
          ? withdrawalMessage(result, currency)
          : null
      }
      limitMinor={(home) => takeOutLimit(home.availability)}
      guess
    />
  );
}
