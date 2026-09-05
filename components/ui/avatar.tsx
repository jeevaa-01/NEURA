import Image from "next/image";

import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-7 text-[10px]",
    md: "size-9 text-xs",
    lg: "size-12 text-sm",
  };

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-strong bg-accent-muted font-semibold text-accent",
        sizes[size],
        className,
      )}
    >
      {src ? (
        <Image src={src} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
