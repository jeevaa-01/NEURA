import { SystemStatus } from "@/components/shared/system-status";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-5xl font-semibold tracking-[0.2em] sm:text-7xl">
        {APP_NAME}
      </h1>

      <p className="max-w-md text-base text-balance text-muted-foreground sm:text-lg">
        {APP_TAGLINE}
      </p>

      <SystemStatus />
    </main>
  );
}
