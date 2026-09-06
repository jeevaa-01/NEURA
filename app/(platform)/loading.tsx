export default function PlatformLoading() {
  return (
    <div role="status" aria-label="Loading NEURA" className="space-y-6">
      <span className="sr-only">Loading NEURA</span>
      <div className="h-4 w-32 animate-pulse rounded bg-surface-elevated" />
      <div className="h-10 max-w-xl animate-pulse rounded bg-surface-elevated" />
      <div className="h-24 w-full animate-pulse rounded-xl border border-border-default bg-surface" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-lg border border-border-default bg-surface"
          />
        ))}
      </div>
    </div>
  );
}
