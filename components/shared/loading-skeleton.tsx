export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-surface-hover ${className}`}
    />
  );
}
