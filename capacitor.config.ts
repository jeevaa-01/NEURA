import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor reads this build-time setting before the Next.js app loads.
const serverUrl =
  // eslint-disable-next-line no-restricted-syntax
  process.env.CAPACITOR_SERVER_URL?.trim() || "http://10.0.2.2:3000";

const config: CapacitorConfig = {
  appId: "com.neura.platform",
  appName: "NEURA",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
};

export default config;
