import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { serverEnv } from "@/lib/validations/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Small provider seam for account email. Development writes an inspectable
 * message to a private local inbox; production can use the dependency-free
 * Resend HTTP API. No credentials are stored in the repository.
 */
export async function sendEmail(message: EmailMessage) {
  const env = serverEnv();
  if (env.EMAIL_PROVIDER === "console") {
    if (env.NODE_ENV === "production")
      throw new Error(
        "The console email provider is disabled in production. Configure Resend.",
      );
    const directory = path.resolve(env.EMAIL_DEV_INBOX_DIR);
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${Date.now()}-${randomUUID()}.eml`);
    await writeFile(
      file,
      `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
      { flag: "wx", mode: 0o600 },
    );
    console.info("[email:development] message written", {
      to: message.to,
      subject: message.subject,
      file,
    });
    return;
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend.",
    );

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Email provider returned HTTP ${response.status}.`);
}
