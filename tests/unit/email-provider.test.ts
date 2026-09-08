import { describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  serverEnv: vi.fn(),
}));

vi.mock("@/lib/validations/env", () => runtime);

describe("account email delivery", () => {
  it("fails safely when production email delivery is not configured", async () => {
    runtime.serverEnv.mockReturnValueOnce({
      NODE_ENV: "production",
      EMAIL_PROVIDER: "console",
      EMAIL_DEV_INBOX_DIR: ".local-email-inbox",
    });
    const { sendEmail } = await import("@/lib/email/provider");

    await expect(
      sendEmail({
        to: "person@example.com",
        subject: "Reset",
        text: "Reset link",
        html: "<p>Reset link</p>",
      }),
    ).rejects.toThrow("console email provider is disabled in production");
  });

  it("does not expose provider credentials or response bodies in failures", async () => {
    runtime.serverEnv.mockReturnValueOnce({
      NODE_ENV: "production",
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "no-reply@example.com",
      RESEND_API_KEY: "test-secret",
    });
    const request = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue("provider-secret-response"),
    });
    vi.stubGlobal("fetch", request);
    const { sendEmail } = await import("@/lib/email/provider");

    await expect(
      sendEmail({
        to: "person@example.com",
        subject: "Reset",
        text: "Reset link",
        html: "<p>Reset link</p>",
      }),
    ).rejects.toThrow("HTTP 503");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
