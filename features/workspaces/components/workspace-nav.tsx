import Link from "next/link";

import { cn } from "@/lib/utils";

export function WorkspaceNav({
  workspaceSlug,
  active,
}: {
  workspaceSlug: string;
  active: "overview" | "members" | "invitations" | "knowledge" | "settings";
}) {
  const items = [
    {
      label: "Overview",
      href: `/app/workspaces/${workspaceSlug}`,
      key: "overview",
    },
    {
      label: "Members",
      href: `/app/workspaces/${workspaceSlug}/members`,
      key: "members",
    },
    {
      label: "Invitations",
      href: `/app/workspaces/${workspaceSlug}/invitations`,
      key: "invitations",
    },
    {
      label: "Settings",
      href: `/app/workspaces/${workspaceSlug}/settings`,
      key: "settings",
    },
    {
      label: "Knowledge",
      href: `/app/workspaces/${workspaceSlug}/knowledge`,
      key: "knowledge",
    },
  ] as const;

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border-subtle"
      aria-label="Workspace sections"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            "focus-ring border-b-2 border-transparent px-3 py-3 text-xs whitespace-nowrap text-text-muted hover:text-text-primary",
            item.key === active && "border-accent text-accent",
          )}
          aria-current={item.key === active ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
