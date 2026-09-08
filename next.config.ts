import type { NextConfig } from "next";

const nextConfig: NextConfig = { output: "standalone" };
// Next loads this file before application modules; NODE_ENV is the framework's
// build-time production switch and is safe to read only for this header.
// eslint-disable-next-line no-restricted-syntax
const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
        {
          key: "Content-Security-Policy",
          value:
            "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none';",
        },
      ]
    : []),
];

nextConfig.headers = async () => [
  { source: "/(.*)", headers: securityHeaders },
];

export default nextConfig;
