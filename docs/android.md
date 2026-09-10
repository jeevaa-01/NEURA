# NEURA Android App

NEURA uses Capacitor to package the existing Next.js platform as an Android
application. The Android shell does not duplicate the backend: authentication,
workspace data, messages, AI, daily agents, PostgreSQL, and Redis continue to
run on the configured NEURA server.

## Local emulator

Start the production-style local app first:

```bash
docker compose --env-file .env --env-file .env.local --profile production up -d
```

The default Capacitor URL is `http://10.0.2.2:3000`, which is the Android
emulator's route to the host machine. For a physical device, use the host's
LAN address instead:

```powershell
$env:APP_BIND_ADDRESS = "0.0.0.0"
$env:CAPACITOR_SERVER_URL = "http://192.168.1.20:3000"
docker compose --env-file .env --env-file .env.local --profile production up -d
npm run android:sync
```

The Android device and development machine must be on the same network, and
the app server must be reachable from that device.

Keep `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, and `CAPACITOR_SERVER_URL` on
the same canonical origin for each environment. Do not mix `localhost`,
`127.0.0.1`, or a LAN address: Better Auth intentionally rejects origins that
are not explicitly configured.

## Production build

Always use the deployed HTTPS origin for a release build:

```powershell
$env:CAPACITOR_SERVER_URL = "https://app.example.com"
npm run android:sync
npm run android:build
```

Do not package `localhost` or `10.0.2.2` for production. HTTPS is required so
Better Auth session cookies and provider requests remain protected.

## Android tooling

Android Studio, an Android SDK, and a JDK supported by the generated Gradle
project are required to build or open the native project. `npm run android:open`
opens the project in Android Studio. The generated `android/` project is source
controlled; SDK paths and build output remain ignored.

Native push notifications are a follow-up integration. The existing daily-agent
scheduler continues to create messages and in-app notifications independently
of the Android shell.
