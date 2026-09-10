import { describe, expect, it } from "vitest";

import { resolveCanonicalOrigin } from "@/lib/auth/origin";

describe("canonical authentication origin", () => {
  it("uses the application origin by default and strips path drift", () => {
    expect(resolveCanonicalOrigin("http://localhost:3000/")).toBe(
      "http://localhost:3000",
    );
    expect(resolveCanonicalOrigin("https://app.example.com/app")).toBe(
      "https://app.example.com",
    );
  });

  it("uses only the explicitly configured auth origin when provided", () => {
    expect(
      resolveCanonicalOrigin(
        "https://app.example.com",
        "https://auth.example.com/login",
      ),
    ).toBe("https://auth.example.com");
  });
});
