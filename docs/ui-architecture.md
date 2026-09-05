# NEURA UI architecture

This document describes the Phase 4 UI foundation: a dark, dense application
shell with real authentication data and intentionally empty product surfaces.

## Application shell

`components/layout/app-shell.tsx` is the authenticated chrome mounted by
`app/(platform)/layout.tsx`. The server layout remains the session boundary and
passes only the authenticated user's display data into the client shell.

The desktop shell is composed of four layers:

1. A 72px global rail for primary destinations and the user menu.
2. A 260px workspace sidebar for favorites, channels and direct messages.
3. A flexible main content area for route-specific product surfaces.
4. An optional 304px context panel for system status and future intelligence.

The context panel is intentionally a UI placeholder. It does not represent
fake workspace activity or generated AI content.

## Design tokens

Semantic CSS variables live in `app/globals.css`. The default `:root` values
define the deep graphite theme and cover surfaces, borders, text, accent and
status colors. Components use Tailwind aliases such as `bg-surface`,
`text-text-secondary` and `border-border-default`, rather than product colors.

The `.light` token block is reserved for a future theme switch. No theme
switching behavior is shipped in this phase.

## Responsive behavior

- Desktop (1280px and above): rail, workspace sidebar, main area and context
  panel are visible.
- Tablet (768px to 1279px): rail, workspace sidebar and main area remain; the
  context panel is hidden.
- Mobile (under 768px): only the main area is persistent. Workspace navigation
  becomes a slide-out drawer, global navigation becomes a bottom bar, and the
  top bar exposes search and the user menu. Touch targets are at least 40px,
  with primary navigation targets sized for comfortable use.

## Component architecture

Reusable foundation components live in `components/`:

- `components/neura/logo-mark.tsx`: original geometric N mark and wordmark.
- `components/ui/button.tsx`, `badge.tsx`, `avatar.tsx`, and `separator.tsx`:
  small primitives built on the existing dependency set.
- `components/shared/page-header.tsx`, `empty-state.tsx`, and
  `loading-skeleton.tsx`: consistent route and loading states.
- `components/shared/platform-placeholder.tsx`: shared placeholder route frame.
- `components/layout/app-shell.tsx`: composition and interaction boundary for
  navigation, command palette, user menu, drawer and context panel.

## Navigation architecture

The current route map is:

| Route | Surface |
| --- | --- |
| `/app` | Command center |
| `/app/messages` | Messages placeholder |
| `/app/activity` | Activity placeholder |
| `/app/agents` | Agents placeholder |
| `/app/search` | Search placeholder |
| `/app/profile` | Profile placeholder |
| `/app/settings` | Settings placeholder |

The route list is defined once in the shell for rail, mobile and command
palette navigation. The pages remain server components, so future data loading
can be added without turning the entire shell into a client component.

## Command palette

The palette is UI-only and lives in the shell. `Ctrl+K` and `Cmd+K` open it;
Escape closes it; Arrow Up/Down changes the highlighted command; Enter opens
the selected route. It currently navigates to the existing placeholder pages
and opens the workspace-coming-soon dialog for workspace creation.

## Future UI extension strategy

Keep domain data and mutations outside the shell. Add route-specific feature
components under `features/`, pass server-fetched data into focused client
components only when interaction requires it, and extend the token layer for
new themes or status states. The empty states should be replaced by real
loading, error and data states as each backend phase lands—without changing the
shell's navigation contract.
