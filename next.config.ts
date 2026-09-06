import type { NextConfig } from "next";

const nextConfig: NextConfig = {/* config options here */};
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
      ]
    : []),
];

nextConfig.headers = async () => [
  { source: "/(.*)", headers: securityHeaders },
];

export default nextConfig;
