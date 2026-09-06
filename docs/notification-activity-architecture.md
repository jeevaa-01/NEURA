# Notifications & Activity Architecture

Phase 14 adds a server-authoritative notification and activity vertical slice.

## Event flow

Successful server mutation → `emitApplicationEvent` → recipient/resource
authorization → preference policy → deterministic deduplication → persisted
notification/activity → user-scoped Redis/SSE delivery.

Events are emitted after the authoritative database mutation succeeds. A failed
notification insert or realtime publish is logged and never turns the already
successful product mutation into a false failure. The existing Phase 9 Redis
bus remains the transport; `/api/realtime/notifications` is only a user-scoped
topic on that bus.

## Supported notifications

The MVP supports message mentions, thread replies, reactions, private-channel
and workspace invitations, task assignment/update signals, AI action success or
failure, workflow completion/failure, and knowledge indexing results.

Mentions use the existing `MessageMention` rows. Thread notifications target
the root author and previous participants, not the whole channel. Reactions
target only the message author and never the reactor.

## Authorization and privacy

Notification reads and read-state mutations are always scoped to the current
authenticated user. Workspace and channel recipients are rechecked against
active membership and private-channel membership. Archived/private channels
are not exposed to users who cannot currently access them. Invitation delivery
is the only intentional exception to workspace membership because the recipient
has not joined yet; the recipient is resolved server-side from the invitation
email. Browser input never supplies the effective recipient or actor.

Notification targets are internal paths without invitation tokens. Destination
routes still perform their normal authorization. Missing or deleted resources
therefore degrade to the existing safe page rather than becoming an access
bypass.

## Persistence and deduplication

`Notification.dedupKey` and `ActivityEvent.dedupKey` are unique database
boundaries. Replayed events return the existing record. Queries are bounded to
30 notifications per page and 100 activity entries. Notifications are retained
for history in this MVP; cleanup/retention jobs are deferred.

## Activity

Activity is intentionally separate from `AIAuditLog`: activity is a concise,
permission-filtered workspace history, while audit records are for security and
accountability. Current activity events include messages, thread replies,
channels, tasks, AI actions, workflows, and knowledge indexing.

## Read state and preferences

Unread count uses a database `COUNT` over the current user’s unread rows. Mark
one/all read operations include `userId` in the update predicate. Preferences
support mentions, thread replies, reactions, task assignments, AI actions, and
workflows. Invitations are treated as critical and are not preference-muted.

## AI, workflows, and knowledge

AI action notifications are created only for the initiating user after the
Phase 12 action reaches a terminal success/failure state. Workflow notifications
are created only for the initiating user after Phase 13 execution completion,
failure, expiration, or cancellation. Knowledge notifications remain scoped to
the initiating authorized user and channel access; internal errors and hidden
document data are not included in notification content.

## Realtime and email status

The notification stream uses the existing authenticated Redis/SSE architecture
and publishes only to `neura:realtime:v1:user:<userId>`. Database persistence is
the source of truth if SSE is unavailable. Email notifications, push, mobile
delivery, background cleanup, and external event buses are deferred.

## Known limitations and future improvements

The MVP has no scheduled/webhook triggers, worker queue, email provider, push
delivery, or live resource-preview resolver. Activity currently has a bounded
cross-workspace page rather than per-workspace filters or infinite loading.
