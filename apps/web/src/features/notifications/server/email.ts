import "server-only";
import { serverEnv } from "@/config/env.server";
import { AppError, logger } from "@/lib";
import type { EmailMessage, EmailResult } from "../types";

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Optional email adapter (D13). Sends via Resend when configured, otherwise skips.
 * Never logs the recipient or body: both are personal data and logs are public.
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const { RESEND_API_KEY, EMAIL_FROM } = serverEnv;
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    logger.info("email skipped", { reason: "not configured" });
    return "skipped";
  }

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new AppError("INTERNAL", "Email could not be sent", { cause: { status: res.status } });
  }
  return "sent";
}
