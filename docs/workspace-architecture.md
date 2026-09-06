# NEURA workspace architecture

Phase 5 introduces the first real tenant boundary. Workspaces are persisted in
PostgreSQL and all workspace mutations authenticate the current session and
authorize the requested workspace on the server.

## Workspace lifecycle

1. An authenticated user submits a name and optional description.
2. The workspace service normalizes the name into a URL-safe slug.
3. A transaction creates the workspace, owner membership and default channels.
4. The action returns a small workspace DTO and the UI navigates to its URL.
5. Members can view metadata, public channels, member count and their role.
6. Admins/owners can update metadata. Non-owners can leave. Owners can delete.

## Creation transaction

`features/workspaces/services/workspace-service.ts` uses one Prisma interactive
transaction. It creates the `Workspace`, an `ACTIVE` `WorkspaceMember` with the
`OWNER` role, then `general` and `announcements` channels. Any failure rolls
back all records, so a partially-created workspace cannot be exposed.

Default channels:

| Name | Type | Description | Position |
| --- | --- | --- | --- |
| `general` | `TEXT` | General workspace discussion | 0 |
| `announcements` | `ANNOUNCEMENT` | Important workspace announcements | 1 |

Both are public and use the creator as `createdById`. No messages or channel
members are fabricated.

## Slug strategy

`slugifyWorkspaceName` lowercases, removes accents, converts non-alphanumeric
runs to hyphens and falls back to `workspace` for names with no usable
characters. The first candidate is deterministic (`neura-development`), with
readable suffixes for collisions (`-2`, `-3`, ...). The database unique
constraint remains authoritative: a `P2002` rolls back the full transaction and
the service retries with the next candidate, which is safe under concurrency.

## Membership model

`WorkspaceMember` is the membership record. Workspace listing returns only
`ACTIVE` memberships and only the navigation DTO fields. Leaving a workspace
sets the membership to `LEFT`, preserving historical membership identity while
removing access. Private workspace data is never returned unless the requester
has an active membership.

## Authorization model

`features/workspaces/services/authorization.ts` centralizes membership and role
checks:

- `requireWorkspaceMembership`: active members only; missing access behaves as
  not found to avoid leaking workspace existence.
- `requireWorkspaceRole`: checks an active member against an allow-list.
- `requireWorkspaceOwner`: owner-only shorthand used for deletion.

Actions never accept an owner or user id from the client. They derive the user
from the Better Auth session and map unexpected database failures to safe,
user-facing errors.

## URL architecture

The active workspace is URL-based:

`/app/workspaces/[workspaceSlug]`

The route validates the authenticated session, loads only workspaces where the
user has an active membership, renders the real public channels and active
member count, and uses `notFound()` for unauthorized or missing workspaces.
The slug is stable when the workspace name changes.

## Update, leave and delete rules

- `OWNER` and `ADMIN` may update name, description and optional icon URL.
- `MODERATOR`, `MEMBER` and `GUEST` may not update workspace metadata.
- `MODERATOR`, `MEMBER`, `GUEST` and `ADMIN` may leave.
- An owner cannot leave: ownership must be transferred or the workspace must
  be deleted first.
- Only the owner may delete. The UI asks for explicit confirmation, while the
  action verifies ownership again and relies on the schema's workspace-scoped
  cascade relations.

## Future invite extension

`WorkspaceInvite` already belongs to the workspace boundary. A future invite
flow should authorize invite creation with the same role service, create or
restore an active membership only after an accepted invite, and keep invite
redemption separate from the workspace creation transaction.

## Phase 6 collaboration layer

Invitations reuse the existing `WorkspaceInvite` model. Its unique `code`
column stores a SHA-256 token digest; the 32-byte random URL token is held only
in memory long enough to return the invitation URL to the inviter or delivery
adapter. New invitations expire after seven days. An invitation is active only
when it is pending, unrevoked and unexpired. Declining uses the existing
`REVOKED` status because the Phase 2 enum has no separate `DECLINED` value.

Creation, acceptance, decline and resend are transactional. Acceptance checks
the digest, status, expiry and invitee email, then creates or reactivates one
membership and marks the invitation accepted in the same serializable
transaction. Resend overwrites the digest and expiry, invalidating the old
URL. Pending invitation queries never select or return the digest.

## Member permissions and ownership

Owners can invite, revoke, manage non-owner roles, remove members, transfer
ownership and delete the workspace. Admins can invite, revoke, manage regular
member/moderator/guest roles and remove non-admin members. Members can view
membership and leave. Normal role editing never assigns `OWNER`; ownership has
its own serializable transaction that changes the current owner to `ADMIN`,
promotes the selected active member to `OWNER`, and updates `Workspace.ownerId`.

Member removal and leaving preserve the `WorkspaceMember` history as `LEFT` and
remove the user's workspace channel memberships in the same transaction.

## Channel membership foundation

The existing `ChannelMember` model is reused with its unique
`(channelId, userId)` constraint. Channel membership services require an active
workspace membership before adding, removing or reading channel membership.
Public channels are available to active workspace members; private channels
are available to explicit channel members and workspace owners/admins for
moderation. Full channel creation and messaging remain Phase 7/8 work.

## Routes

- `/app/workspaces/[workspaceSlug]/members` — searchable member list and role/removal controls.
- `/app/workspaces/[workspaceSlug]/invitations` — owner/admin invitation management.
- `/app/workspaces/[workspaceSlug]/settings` — workspace metadata and ownership transfer.
- `/invite/[token]` — authenticated invitation preview and accept/decline flow.

No transactional email provider exists in the repository. The invitation
service therefore exposes a safe URL-generation boundary; a future delivery
adapter can send that URL without changing token storage or acceptance rules.

## Phase 7 channel engine

Channels remain workspace-scoped durable records. The existing `isPrivate`
field is the public/private visibility switch, `slug` is a human-readable
routing identifier, and `id` remains the stable identity future messages will
reference. Channel names are normalized for display and converted into
deterministic slugs (`engineering`, `engineering-2`, and so on). The database
unique constraint on `(workspaceId, slug)` remains authoritative under
concurrent creation and rename requests; a collision retries with the next
suffix rather than overwriting another channel.

The Phase 7 service supports channel creation, access-filtered listing,
settings updates, renaming, visibility changes, archiving/restoring and
owner-authorized deletion. Public channels are available to active workspace
members. Private channels are available only to explicit `ChannelMember`
records plus workspace owners/admins. Private-channel creation seeds the
creator and any selected active workspace members in the same transaction as
the channel, so an inaccessible partial channel cannot be committed.

`ChannelMember` remains the single membership system. Adding or removing a
member checks the target's active membership in the same workspace and is
server-authorized; ordinary members cannot add themselves or arbitrary users.
Members may safely remove their own private-channel membership. Membership
lists are bounded and private-channel data is filtered server-side before it
reaches the browser.

Channels now have `isSystem` and nullable `archivedAt` fields. Phase 5's
`general` and `announcements` channels are marked system channels by the
follow-up migration and cannot be archived or deleted. Archiving is
recoverable, removes a channel from normal member navigation, and remains
visible to authorized owners/admins. Hard deletion is limited to channel
managers and non-system channels and relies on the existing Prisma cascades.

Channel routes are:

- `/app/workspaces/[workspaceSlug]/channels/[channelSlug]` — protected channel shell.
- `/app/workspaces/[workspaceSlug]/channels/[channelSlug]/settings` — manager settings and private-member management.

The workspace sidebar lists only channels the current user can access. Owners
and admins can also see archived channels for recovery; unauthorized private
channels are never fetched and direct cross-workspace or private-channel URLs
resolve as not found. Channel settings and lifecycle mutations re-check the
workspace boundary and role on the server, independent of client controls.

## Phase 8 messaging engine

Messaging reuses the existing `Message` model and its workspace channel
boundary. Root messages use `channelId` with `parentId = null`; replies use
`parentId` and must point to a non-deleted root message in the same channel.
Messages are soft-deleted, preserving authorship and thread shape while
returning null content to readers. Message edits remain limited to the author,
and deletion is available to the author or an owner/admin moderator.

`MessageReaction` stores one emoji reaction per user/message pair through its
existing unique constraint. `MessageMention` rows are resolved server-side
from active workspace usernames, with private-channel mentions restricted to
explicit channel members and workspace managers. The existing `Attachment`
model is metadata-only; no upload or storage provider is introduced in this
phase.

Every message read, write, thread, reaction, search and read-state operation
reuses `canAccessChannel` and server-side workspace membership checks. Archived
channels remain readable to authorized users, while message creation and
ordinary edits are rejected. Channel history and thread replies use bounded
cursor pagination with a maximum page size of 50, ordered by `(createdAt, id)`.

Read state reuses `ChannelMember.lastReadAt`; public-channel readers may receive
an explicit membership row when marking a channel read. Search is PostgreSQL
case-insensitive substring search, restricted first to channel IDs returned by
the server-side accessible-channel query, and excludes soft-deleted messages.

The protected route
`/app/workspaces/[workspaceSlug]/channels/[channelSlug]` server-loads the
initial history and read state, then renders the message board. Composer,
editing, soft deletion, reactions, threads, bounded history loading, current
channel search and manual read marking are available without fake records.
Realtime delivery, presence, notifications, attachments/upload handling and
AI assistance remain explicit Phase 9 boundaries.

## Phase 9 realtime engine

Realtime uses authenticated Server-Sent Events at `/api/realtime?channelId=…`
and the existing Redis 7/ioredis installation as a Pub/Sub fan-out bus. This
fits the current standard Next.js Node server without a custom server or a
new dependency. PostgreSQL remains authoritative: message services commit
first, then publish a typed notification; Redis failure is logged and isolated
from the database mutation.

Events use the `neura:realtime:v1:channel:{channelId}` namespace and include an
event ID, timestamp, workspace ID, channel ID, entity ID and a bounded safe
payload. Implemented events cover message creation/update/deletion, thread
replies, reactions, presence snapshots/online/offline, typing start/stop and
channel read state. Clients validate event shape, ignore stale channel events,
deduplicate event IDs and upsert by stable message ID.

Every SSE connection authenticates with the existing Better Auth HTTP-only
session, verifies active workspace membership and calls `canAccessChannel`
before subscribing. Private channels therefore require explicit membership or
the existing owner/admin override. Authorization is rechecked during the
presence heartbeat, and reconnects create a new authenticated, authorized
subscription. Clients subscribe only to their active channel.

The client hook exposes connecting, connected, reconnecting and disconnected
states. It uses bounded exponential backoff, reauthorizes on reconnect, and
reloads the latest Phase 8 message window/read state after reconnection. The
message board applies realtime changes without reloading history; reactions
and typing are lightweight, while message persistence still uses Phase 8
actions/services.

Presence is ephemeral Redis sorted-set state with expiring connection entries,
so multiple tabs/devices keep a user online until their last valid connection
ends. Typing is debounced/throttled in the composer and is never persisted.
Read state continues to use `ChannelMember.lastReadAt` and publishes only after
the existing persistence succeeds.

This implementation assumes a Node-compatible deployment with streaming
support and Redis Pub/Sub. Proxies must allow long-lived SSE responses and
disable response buffering where necessary. The design supports horizontal
fan-out through Redis, while stale presence entries naturally expire after a
process crash. Realtime replay, presence analytics, push/email notifications,
WebSockets and the remaining Phase 9 exclusions are not introduced.

## Phase 10 AI and agent engine

The intelligence layer is implemented as a server-only provider boundary plus
an orchestration layer. `features/ai/services/provider.ts` defines the provider
contract; the initial adapter uses native `fetch` against OpenAI Chat
Completions so the application does not expose a provider key or couple the UI
to an SDK. A later provider can implement the same streaming and tool-call
contract without changing the route or assistant UI.

`POST /api/ai/chat` is a dedicated AI SSE stream and is intentionally separate
from `/api/realtime`. Collaboration realtime carries durable workspace events;
the AI stream carries `conversation.ready`, text deltas, tool progress,
completion and safe error events. The route uses Node streaming headers and
disables proxy buffering. PostgreSQL remains the source of truth for
`AIConversation`, `AIMessage`, `AIUsage` and `AIAuditLog` records.

The orchestrator authenticates the Better Auth session, verifies active
workspace membership, checks channel access with the existing private-channel
authorization service, rate-limits the request in Redis, persists the user
message, and only persists an assistant message after a non-empty provider
completion. Usage and minimal audit metadata are recorded without prompts,
provider keys or hidden instructions. There is no fabricated assistant output
when the provider is not configured or fails.

Context is bounded before it reaches the provider: channel/workspace retrieval
uses existing access-filtered message services, limits the number of messages
and total characters, and marks retrieved content as untrusted reference data.
Conversation history is also trimmed to a bounded recent window. The first
assistant exposes only read-only tools:

| Tool | Purpose | Authorization |
| --- | --- | --- |
| `search_messages` | Search readable workspace messages | Workspace and optional channel access checked server-side |
| `get_channel_messages` | Read a bounded recent channel window | `canAccessChannel` required |
| `get_workspace_channels` | List accessible channels | Active workspace membership required |
| `get_channel_summary_context` | Read bounded summary context | `canAccessChannel` required |

Tool names, arguments and results are bounded and validated with Zod. No tool
can write data, execute SQL or shell commands, fetch arbitrary URLs, change
permissions, or access an unapproved workspace. Tool results are treated as
untrusted data by the system prompt, and the UI renders assistant text without
raw HTML injection.

The assistant UI lives at `/app/ai`, supports private conversation history,
workspace/channel/conversation-only context modes, progressive streaming,
keyboard submission and a contextual “Ask NEURA” entry on channel pages. The
current rate limit is 20 requests per user/workspace per minute using the
existing Redis client. Configure `OPENAI_API_KEY`, `OPENAI_MODEL` and
`AI_MAX_OUTPUT_TOKENS` server-side; the API key is never a `NEXT_PUBLIC_`
variable. This phase intentionally does not add embeddings, a vector database,
autonomous loops, background jobs, memory across users, write actions, or
third-party agent protocols.

## Phase 11 — Knowledge & RAG Engine

Phase 11 adds a bounded knowledge vertical slice without changing the Phase 10
AI boundary. The supported source is explicitly pasted plain text or Markdown;
there is no upload store, binary parser or connector in the repository yet.
Workspace owners/admins create sources from the workspace Knowledge section,
and the source is synchronously processed through:

`source → parse/normalize → paragraph-aware chunks → batched embeddings → PostgreSQL vector store → authorized retrieval → AI context`

`KnowledgeSource`, `KnowledgeDocument` and `KnowledgeChunk` are the durable
models. `KnowledgeChunk.embedding` is currently a JSON numeric vector because
the deployed `postgres:16-alpine` image does not enable pgvector. The
`VectorStore` interface isolates this fallback so a pgvector implementation
can replace the bounded application-side cosine search when the database image
is deliberately upgraded. PostgreSQL remains the source of truth; vectors are
only a search accelerator.

The parser accepts only `text/plain` and `text/markdown`, normalizes line
endings/whitespace, rejects control characters, limits extracted text to
200,000 characters and limits output to 200 chunks. Chunking preserves
paragraph boundaries where possible, applies a small overlap, and uses an
approximate character/token count. OpenAI `text-embedding-3-small` is the one
centralized embedding model, called server-side in batches of 32. Failed
embedding requests mark both source and document `FAILED`; successful
replacement deletes old chunks before inserting the new complete set and only
then marks the source `READY`.

Checksums prevent duplicate content in the same workspace/scope. Explicit
re-indexing is available from the Knowledge UI, while deletion marks the source
`DELETING` before its document/chunks are removed. No source is presented as
ready during processing, so old vectors are not searchable during replacement.

Retrieval authorizes the workspace and requested channel before querying. It
builds the allowed channel ID set with the existing channel service, filters
the PostgreSQL query to workspace-level sources or those channel IDs, verifies
private-channel access through `canAccessChannel`, and then performs bounded
cosine plus deterministic keyword weighting. Results are deduplicated and
limited to eight chunks. The existing Phase 10 message search remains
authoritative for message context; messages are not copied into the knowledge
tables in this phase.

Retrieved chunks carry real chunk/source/document/channel IDs. The AI
orchestrator places them in an explicit untrusted reference block, emits safe
source metadata in the AI stream, instructs the model to cite only supplied
labels, and persists citations on assistant messages. Conversation reads
revalidate citation chunk existence, source readiness and current channel
access, so deleted or newly unauthorized sources are removed from the UI.
Knowledge search is also available as a bounded read-only Phase 10 tool with
its own workspace/channel authorization and validated arguments.

Knowledge management is available at
`/app/workspaces/[workspaceSlug]/knowledge`. Members can see only readable
workspace/channel sources; owners/admins can create, retry and delete. Redis is
reused for the existing AI request limiter, while synchronous indexing remains
deliberately small and avoids introducing a queue or microservice. Configure
the embedding model and limits with the `KNOWLEDGE_*` server variables in
`.env.example`. Actual cost is not estimated; provider-reported embedding
tokens are recorded in the existing AI usage table and source lifecycle/tool
actions are audited without storing full private documents in audit metadata.

Known limitations are the lack of pgvector in the current database image,
manual text-only ingestion, synchronous indexing, no PDF/DOCX/binary upload
support, and application-side vector ranking that is appropriate only for the
current bounded dataset. Phase 12 can add a deliberate pgvector migration,
background indexing, richer parsers/storage, message indexing adapters and
source-specific permissions without changing the authorization contract.

## Phase 12 — AI Action & Automation Engine

Phase 12 keeps the Phase 10 orchestrator, provider boundary, rate limiter and
tool authorization model, then adds a single explicit action registry. Read
tools are `get_workspace_info`, `list_channels`, `get_channel_info`,
`search_messages`, `get_recent_messages`, `search_knowledge` and
`summarize_channel`. Write tools are limited to `create_message`,
`create_channel`, `update_channel`, `create_knowledge_document` and
`create_task`; no destructive tool is registered.

Write tool calls never execute directly from model output. They create an
`AIAction` proposal with a server-built preview, a ten-minute expiry, a
client-independent idempotency key and a persisted lifecycle through
`APPROVED`, `EXECUTING`, `SUCCEEDED`, `FAILED`, `CANCELLED` or `EXPIRED`.
Confirmation and execution server actions accept only the action ID. Execution
re-authenticates the session, re-checks tenant and resource authorization, and
uses a conditional status claim to prevent duplicate writes. Lifecycle events
use the existing `AIAuditLog` without copying secrets or unnecessary content.

The automation seam is a synchronous sequential runner capped at three steps
and 45 seconds. Read steps execute in order; the first write step becomes the
same confirmation-gated `AIAction`. There is no scheduler, recursion,
background worker or second realtime system. Message writes reuse the Phase 8
realtime events, while channel/knowledge/task changes use authoritative reads
and the existing server-action refresh boundary. See
`docs/ai-action-automation.md` for the complete contract and operational
limitations.
