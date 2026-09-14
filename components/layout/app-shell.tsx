"use client";

import {
  Activity,
  Bell,
  Bot,
  ChevronDown,
  Hash,
  Home,
  LayoutGrid,
  LockKeyhole,
  Menu,
  MessageSquare,
  PanelRight,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { CreateWorkspaceButton } from "@/components/shared/create-workspace-button";
import { LogoMark } from "@/components/neura/logo-mark";
import { Avatar } from "@/components/ui/avatar";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { NotificationCenter } from "@/features/notifications/components/notification-center";
import type { FavoriteChannelSummary } from "@/features/favorites/types";
import type { DirectConversationSummary } from "@/features/messages/types";
import { createWorkspaceAction } from "@/features/workspaces/actions/create-workspace";
import type { WorkspaceSummary } from "@/features/workspaces/types";
import { createWorkspaceSchema } from "@/features/workspaces/validations/create-workspace-schema";
import { cn } from "@/lib/utils";

export type AppUser = {
  name: string;
  username: string;
  email: string;
  image?: string | null;
};

type NavItem = { label: string; href: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/app", icon: Home },
  { label: "Messages", href: "/app/messages", icon: MessageSquare },
  { label: "Activity", href: "/app/activity", icon: Activity },
  { label: "Agents", href: "/app/agents", icon: Bot },
  { label: "Ask NEURA", href: "/app/ai", icon: Sparkles },
];

const COMMAND_ITEMS = [
  ...NAV_ITEMS,
  { label: "Notifications", href: "/app/notifications", icon: Bell },
  { label: "Profile", href: "/app/profile", icon: UserRound },
  { label: "Settings", href: "/app/settings", icon: Settings },
  { label: "Search", href: "/app/search", icon: Search },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname.startsWith(href);
}

function RailLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-label={item.label}
      title={item.label}
      className={cn(
        "focus-ring relative flex size-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary",
        active && "bg-accent-muted text-accent",
      )}
      aria-current={active ? "page" : undefined}
    >
      {active && (
        <span className="absolute left-0 h-5 w-0.5 rounded-r-full bg-accent" />
      )}
      <Icon
        aria-hidden
        className="size-[18px]"
        strokeWidth={active ? 2 : 1.7}
      />
    </Link>
  );
}

function WorkspaceSidebar({
  open,
  onClose,
  onCreateWorkspace,
  pathname,
  workspaces,
  favorites,
  conversations,
}: {
  open: boolean;
  onClose: () => void;
  onCreateWorkspace: () => void;
  pathname: string;
  workspaces: WorkspaceSummary[];
  favorites: FavoriteChannelSummary[];
  conversations: DirectConversationSummary[];
}) {
  const activeSlug = pathname.match(/^\/app\/workspaces\/([^/]+)/)?.[1];
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.slug === activeSlug,
  );
  const channelWorkspace =
    activeWorkspace ??
    workspaces.find(
      (workspace) => workspace.role === "OWNER" || workspace.role === "ADMIN",
    );
  const canCreateChannel = Boolean(channelWorkspace);
  const channelCreateHref = channelWorkspace
    ? `/app/workspaces/${channelWorkspace.slug}?create=channel`
    : "#";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-border-subtle bg-surface transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
      aria-label="Workspace navigation"
    >
      <div className="flex h-[72px] items-center justify-between border-b border-border-subtle px-5 md:hidden">
        <LogoMark showWordmark />
        <button
          className="focus-ring rounded-md p-2 text-text-secondary"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-elevated/30 px-4 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-bold text-[#0b0d12]">
            {activeWorkspace?.name.slice(0, 1).toUpperCase() ?? "N"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {activeWorkspace?.name ?? "All workspaces"}
            </p>
            <p className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
              {activeWorkspace ? "Active workspace" : "NEURA"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <div className="mb-7">
          <SectionLabel
            label="Workspaces"
            action={
              <button
                type="button"
                onClick={onCreateWorkspace}
                aria-label="Create workspace"
                className="focus-ring inline-flex rounded p-1 hover:bg-surface-hover hover:text-text-primary"
              >
                <Plus aria-hidden className="size-3.5" />
              </button>
            }
          />
          {workspaces.length ? (
            <div className="mt-2 space-y-1">
              {workspaces.map((workspace) => {
                const active = workspace.slug === activeSlug;
                return (
                  <Link
                    key={workspace.id}
                    href={`/app/workspaces/${workspace.slug}`}
                    onClick={onClose}
                    className={cn(
                      "focus-ring flex min-h-10 items-center gap-2 rounded-md px-2.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                      active && "bg-accent-muted text-accent",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="flex size-6 items-center justify-center rounded bg-surface-active text-[10px] font-semibold text-accent">
                      {workspace.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{workspace.name}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-border-default px-3 py-3 text-xs leading-5 text-text-muted">
              Your workspaces will appear here.
            </div>
          )}
        </div>
        <div className="mb-7">
          <SectionLabel label="Favorites" action={null} />
          {favorites.length ? (
            <div className="mt-2 space-y-0.5">
              {favorites.map((favorite) => (
                <Link
                  key={favorite.id}
                  href={`/app/workspaces/${favorite.workspaceSlug}/channels/${favorite.channelSlug}`}
                  onClick={onClose}
                  className="focus-ring flex min-h-9 items-center gap-2 rounded-md px-2.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <span className="text-accent">★</span>
                  <span className="truncate">{favorite.channelName}</span>
                  <span className="ml-auto max-w-20 truncate text-[9px] text-text-muted">
                    {favorite.workspaceSlug}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-border-default px-3 py-3 text-xs leading-5 text-text-muted">
              Star a channel to keep it here.
            </div>
          )}
        </div>

        <div className="mb-7">
          <SectionLabel
            label="Channels"
            action={
              canCreateChannel ? (
                <Link
                  href={channelCreateHref}
                  onClick={onClose}
                  aria-label="Create channel"
                  className="focus-ring inline-flex rounded p-1 hover:bg-surface-hover hover:text-text-primary"
                >
                  <Plus aria-hidden className="size-3.5" />
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-label="Create channel unavailable"
                  title="Only workspace owners and admins can create channels"
                  className="inline-flex cursor-not-allowed rounded p-1 text-text-muted/50"
                >
                  <Plus aria-hidden className="size-3.5" />
                </button>
              )
            }
          />
          {activeWorkspace?.channels.length ? (
            <div className="mt-2 space-y-0.5">
              {activeWorkspace.channels
                .filter((channel) => !channel.isPrivate)
                .map((channel) => (
                  <ChannelLink
                    key={channel.id}
                    channel={channel}
                    workspaceSlug={activeWorkspace.slug}
                    pathname={pathname}
                    onClick={onClose}
                  />
                ))}
              {activeWorkspace.channels.some(
                (channel) => channel.isPrivate,
              ) && (
                <p className="px-2 pt-3 text-[10px] font-semibold tracking-[0.16em] text-text-muted uppercase">
                  Private
                </p>
              )}
              {activeWorkspace.channels
                .filter((channel) => channel.isPrivate)
                .map((channel) => (
                  <ChannelLink
                    key={channel.id}
                    channel={channel}
                    workspaceSlug={activeWorkspace.slug}
                    pathname={pathname}
                    onClick={onClose}
                  />
                ))}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 px-2 text-xs text-text-muted">
              <Hash aria-hidden className="size-3.5" />
              <span>No channels yet</span>
            </div>
          )}
        </div>

        <div>
          <SectionLabel
            label="Direct messages"
            action={
              <Link
                href="/app/messages"
                onClick={onClose}
                aria-label="New direct message"
                className="focus-ring inline-flex rounded p-1 hover:bg-surface-hover hover:text-text-primary"
              >
                <Plus aria-hidden className="size-3.5" />
              </Link>
            }
          />
          {conversations.length ? (
            <div className="mt-2 space-y-0.5">
              {conversations.slice(0, 8).map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/app/messages/${conversation.id}`}
                  onClick={onClose}
                  className="focus-ring flex min-h-9 items-center gap-2 rounded-md px-2.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent-muted text-[9px] font-semibold text-accent">
                    {conversation.user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">
                    {conversation.user.displayName}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-surface-elevated/60 px-2.5 py-3 text-xs leading-5 text-text-muted">
              <MessageSquare aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>Start a conversation from Messages.</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border-subtle p-3">
        <CreateWorkspaceButton />
      </div>
    </aside>
  );
}

function ChannelLink({
  channel,
  workspaceSlug,
  pathname,
  onClick,
}: {
  channel: WorkspaceSummary["channels"][number];
  workspaceSlug: string;
  pathname: string;
  onClick: () => void;
}) {
  const href = `/app/workspaces/${workspaceSlug}/channels/${channel.slug}`;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "focus-ring flex min-h-9 items-center gap-2 rounded-md px-2.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        active && "bg-accent-muted text-accent",
      )}
      aria-current={active ? "page" : undefined}
    >
      {channel.isPrivate ? (
        <LockKeyhole aria-hidden className="size-3.5 shrink-0" />
      ) : (
        <Hash aria-hidden className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{channel.name}</span>
      {channel.archivedAt && (
        <span className="ml-auto text-[9px] text-text-muted">archived</span>
      )}
    </Link>
  );
}

function SectionLabel({ label, action }: { label: string; action: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2">
      <p className="text-[10px] font-semibold tracking-[0.18em] text-text-muted uppercase">
        {label}
      </p>
      <div className="p-1 text-text-muted">{action}</div>
    </div>
  );
}

function CommandPalette({
  open,
  onClose,
  onCreateWorkspace,
}: {
  open: boolean;
  onClose: () => void;
  onCreateWorkspace: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const commands = useMemo(
    () =>
      [
        ...COMMAND_ITEMS,
        { label: "Create workspace", href: "#create-workspace", icon: Plus },
      ].filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((current) => (current + 1) % Math.max(commands.length, 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected(
          (current) =>
            (current - 1 + Math.max(commands.length, 1)) %
            Math.max(commands.length, 1),
        );
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = commands[selected];
        if (!item) return;
        onClose();
        if (item.href === "#create-workspace") onCreateWorkspace();
        else router.push(item.href);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commands, onClose, onCreateWorkspace, open, router, selected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/75 px-4 pt-[12vh] backdrop-blur-[3px]"
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-strong bg-surface-elevated shadow-[0_24px_80px_-30px_rgba(0,0,0,0.9)]"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border-default px-4">
          <Search aria-hidden className="size-4 text-text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            placeholder="Jump to a destination..."
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            aria-label="Search commands"
          />
          <kbd className="hidden rounded border border-border-default px-1.5 py-0.5 text-[10px] text-text-muted sm:inline">
            ESC
          </kbd>
        </div>
        <div className="p-2">
          {commands.length ? (
            commands.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors",
                    index === selected
                      ? "bg-accent-muted text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover",
                  )}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => {
                    onClose();
                    if (item.href === "#create-workspace") onCreateWorkspace();
                    else router.push(item.href);
                  }}
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-4",
                      index === selected && "text-accent",
                    )}
                  />
                  <span>{item.label}</span>
                  {index === selected && (
                    <span className="ml-auto text-[10px] text-text-muted">
                      ↵
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-8 text-center text-sm text-text-muted">
              No NEURA command matches that query.
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-border-default px-4 py-2.5 text-[10px] text-text-muted">
          <span>
            <kbd className="mr-1 rounded border border-border-default px-1">
              ↑
            </kbd>
            <kbd className="rounded border border-border-default px-1">↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="mr-1 rounded border border-border-default px-1">
              ↵
            </kbd>{" "}
            open
          </span>
        </div>
      </motion.div>
    </div>
  );
}

function UserMenu({
  user,
  open,
  onToggle,
  placement,
}: {
  user: AppUser;
  open: boolean;
  onToggle: () => void;
  placement: "rail" | "header";
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="focus-ring flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-surface-hover"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="relative">
          <Avatar name={user.name} src={user.image} size="sm" />
          <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-surface bg-success" />
        </span>
        <span className="hidden min-w-0 flex-1 md:block">
          <span className="block truncate text-xs font-medium text-text-primary">
            {user.name}
          </span>
          <span className="block truncate text-[10px] text-text-muted">
            @{user.username}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className="hidden size-3.5 text-text-muted md:block"
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className={cn(
              "absolute z-50 w-[min(256px,calc(100vw-1rem))] rounded-lg border border-border-strong bg-surface-elevated p-2 shadow-xl",
              placement === "rail"
                ? "bottom-0 left-[calc(100%+1rem)]"
                : "top-12 right-0",
            )}
            role="menu"
          >
            <div className="border-b border-border-default px-3 py-2.5">
              <p className="truncate text-sm font-medium text-text-primary">
                {user.name}
              </p>
              <p className="truncate text-xs text-text-muted">{user.email}</p>
            </div>
            <Link
              href="/app/profile"
              onClick={onToggle}
              role="menuitem"
              className="focus-ring mt-1 flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <UserRound aria-hidden className="size-4" />
              Profile
            </Link>
            <Link
              href="/app/settings"
              onClick={onToggle}
              role="menuitem"
              className="focus-ring flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <Settings aria-hidden className="size-4" />
              Settings
            </Link>
            <div className="mt-1 border-t border-border-default pt-1">
              <SignOutButton />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WorkspaceDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, pending]);

  function close() {
    if (pending) return;
    setError(null);
    setFieldError(null);
    setName("");
    setDescription("");
    onClose();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    const parsed = createWorkspaceSchema.safeParse({ name, description });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === "name") setFieldError(issue.message);
      else setError(issue?.message ?? "Enter valid workspace details.");
      return;
    }

    setPending(true);
    try {
      const result = await createWorkspaceAction(parsed.data);
      if (!result.ok) {
        if (result.error.field === "name") setFieldError(result.error.message);
        else setError(result.error.message);
        return;
      }
      setName("");
      setDescription("");
      setError(null);
      setFieldError(null);
      onClose();
      router.push(`/app/workspaces/${result.data.slug}`);
      router.refresh();
    } catch {
      setError("The workspace could not be created. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
          onMouseDown={close}
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="w-full max-w-md rounded-xl border border-border-strong bg-surface-elevated p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent-muted text-accent">
                <LayoutGrid aria-hidden className="size-5" />
              </div>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="focus-ring rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary"
                aria-label="Close dialog"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
              Workspace layer
            </p>
            <h2
              id="workspace-dialog-title"
              className="text-lg font-semibold text-text-primary"
            >
              Create a workspace
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Give your communication layer a name. You can refine its details
              later.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger"
                >
                  {error}
                </p>
              )}
              <div>
                <label
                  htmlFor="workspace-name"
                  className="mb-1.5 block text-xs font-medium text-text-primary"
                >
                  Workspace name
                </label>
                <input
                  id="workspace-name"
                  name="name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setFieldError(null);
                    setError(null);
                  }}
                  autoFocus={!pending}
                  disabled={pending}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={
                    fieldError ? "workspace-name-error" : undefined
                  }
                  className="focus-ring h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent disabled:opacity-60"
                  placeholder="NEURA Development"
                />
                {fieldError && (
                  <p
                    id="workspace-name-error"
                    role="alert"
                    className="mt-1.5 text-xs text-danger"
                  >
                    {fieldError}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="workspace-description"
                  className="mb-1.5 block text-xs font-medium text-text-primary"
                >
                  Description{" "}
                  <span className="font-normal text-text-muted">Optional</span>
                </label>
                <textarea
                  id="workspace-description"
                  name="description"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setError(null);
                  }}
                  disabled={pending}
                  rows={3}
                  className="focus-ring w-full resize-none rounded-md border border-border-default bg-surface px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent disabled:opacity-60"
                  placeholder="A place for the team to align."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="focus-ring min-h-10 flex-1 rounded-md border border-border-default px-4 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="focus-ring inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover disabled:opacity-50"
                >
                  {pending && (
                    <span
                      aria-hidden
                      className="size-3.5 animate-spin rounded-full border-2 border-[#0b0d12]/30 border-t-[#0b0d12]"
                    />
                  )}
                  {pending ? "Creating..." : "Create workspace"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function AppShell({
  children,
  user,
  workspaces,
  favorites,
  conversations,
}: {
  children: ReactNode;
  user: AppUser;
  workspaces: WorkspaceSummary[];
  favorites: FavoriteChannelSummary[];
  conversations: DirectConversationSummary[];
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setSidebarOpen(false);
        setUserOpen(false);
      }
    }
    function onCreateWorkspace() {
      setWorkspaceOpen(true);
      setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("neura:create-workspace", onCreateWorkspace);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("neura:create-workspace", onCreateWorkspace);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-1 bg-background">
      <nav
        className="hidden w-[72px] shrink-0 flex-col items-center border-r border-border-subtle bg-surface py-4 md:flex"
        aria-label="Global navigation"
      >
        <Link
          href="/app"
          aria-label="NEURA home"
          className="focus-ring mb-7 text-text-primary"
        >
          <LogoMark />
        </Link>
        <div className="flex flex-1 flex-col items-center gap-2">
          {NAV_ITEMS.map((item) => (
            <RailLink key={item.href} item={item} pathname={pathname} />
          ))}
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="focus-ring relative flex size-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Search"
            title="Search"
          >
            <Search aria-hidden className="size-[18px]" />
          </button>
        </div>
        <UserMenu
          user={user}
          open={userOpen}
          onToggle={() => setUserOpen((open) => !open)}
          placement="rail"
        />
      </nav>

      <WorkspaceSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCreateWorkspace={() => {
          setWorkspaceOpen(true);
          setSidebarOpen(false);
        }}
        pathname={pathname}
        workspaces={workspaces}
        favorites={favorites}
        conversations={conversations}
      />
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-50 flex h-[72px] shrink-0 items-center justify-between border-b border-border-subtle bg-background/90 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="focus-ring rounded-md p-2 text-text-secondary hover:bg-surface-hover md:hidden"
              aria-label="Open navigation"
            >
              <Menu aria-hidden className="size-5" />
            </button>
            <div className="md:hidden">
              <LogoMark showWordmark />
            </div>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="focus-ring hidden min-h-10 items-center gap-3 rounded-md border border-border-default bg-surface px-3 text-sm text-text-muted hover:border-border-strong hover:text-text-secondary sm:flex sm:w-64 lg:w-80"
            >
              <Search aria-hidden className="size-4" />
              <span className="flex-1 text-left">Search NEURA</span>
              <kbd className="rounded border border-border-default px-1.5 py-0.5 text-[10px]">
                ⌘ K
              </kbd>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="focus-ring flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover sm:hidden"
              aria-label="Search NEURA"
            >
              <Search aria-hidden className="size-[18px]" />
            </button>
            <NotificationCenter />
            <button
              type="button"
              onClick={() => setContextOpen((open) => !open)}
              className="focus-ring hidden size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover xl:flex"
              aria-label={
                contextOpen ? "Hide context panel" : "Show context panel"
              }
              title={contextOpen ? "Hide context panel" : "Show context panel"}
            >
              <PanelRight aria-hidden className="size-[18px]" />
            </button>
            <div className="md:hidden">
              <UserMenu
                user={user}
                open={userOpen}
                onToggle={() => setUserOpen((open) => !open)}
                placement="header"
              />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto bg-background/70">
            <div className="mx-auto min-h-full w-full max-w-[1180px] px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-8 lg:px-10 lg:py-10 lg:pb-10">
              {children}
            </div>
          </main>

          <AnimatePresence initial={false}>
            {contextOpen && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 304, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="hidden shrink-0 overflow-hidden border-l border-border-subtle bg-surface/50 xl:block"
                aria-label="Context panel"
              >
                <div className="w-[304px] p-5">
                  <div className="mb-6 flex items-center justify-between">
                    <p className="text-[10px] font-semibold tracking-[0.18em] text-text-muted uppercase">
                      Context
                    </p>
                    <SlidersHorizontal
                      aria-hidden
                      className="size-4 text-text-muted"
                    />
                  </div>
                  <div className="rounded-lg border border-border-default bg-surface-elevated p-4">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-success" />
                      <p className="text-xs font-medium text-text-primary">
                        System status
                      </p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-text-secondary">
                      Core services are ready for your next signal.
                    </p>
                    <p className="mt-3 text-[10px] tracking-[0.12em] text-success uppercase">
                      Operational
                    </p>
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>

      <nav
        className="safe-area-bottom fixed right-0 bottom-0 left-0 z-20 flex min-h-16 items-center justify-around border-t border-border-subtle bg-surface/95 px-1 py-1 shadow-[0_-12px_32px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md md:hidden"
        aria-label="Mobile navigation"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "focus-ring flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10px] text-text-muted",
                active && "text-accent",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden className="size-[18px]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onCreateWorkspace={() => setWorkspaceOpen(true)}
      />
      <WorkspaceDialog
        open={workspaceOpen}
        onClose={() => setWorkspaceOpen(false)}
      />
    </div>
  );
}
