export function LogoMark({ showWordmark = false }: { showWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        aria-hidden
        viewBox="0 0 32 32"
        className="size-8"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M7 24V8l18 16V8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="square"
        />
        <path
          d="M7 8l9 8"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="square"
        />
        <circle cx="7" cy="8" r="2" fill="var(--accent)" />
        <circle cx="25" cy="8" r="2" fill="currentColor" />
        <circle cx="25" cy="24" r="2" fill="currentColor" />
      </svg>
      {showWordmark && (
        <span className="text-sm font-semibold tracking-[0.28em] text-text-primary">
          NEURA
        </span>
      )}
    </span>
  );
}
