export function PageHeader({
  eyebrow = "NEURA / PLATFORM",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-border-subtle pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div>
        <p className="mb-3 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-text-primary sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}
