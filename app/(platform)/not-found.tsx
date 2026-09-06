import Link from "next/link";

export default function PlatformNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
          NEURA / 404
        </p>
        <h1 className="mt-2 text-xl font-semibold text-text-primary">
          That destination is not available.
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          It may have moved, been archived, or you may no longer have access.
        </p>
        <Link
          href="/app"
          className="focus-ring mt-6 inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover"
        >
          Return to command center
        </Link>
      </div>
    </div>
  );
}
