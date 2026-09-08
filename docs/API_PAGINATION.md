# NEURA Pagination and Filtering

NEURA preserves the pagination style of each existing feature. This phase
documents those contracts; it does not redesign them.

## Search

`GET /api/search` accepts `q` (2–200 characters), optional type/workspace/channel
and user filters, optional `from`/`to` dates, `limit` 1–50 (default 20), and an
opaque `cursor` up to 500 characters. The response is `{ query, items,
nextCursor, hasMore }`. Search gathers authorized result types, applies a
bounded candidate set, and caps cursor offsets at 5,000. Task results are
workspace-scoped and deep-link to the task page; hard-deleted tasks disappear.

The cursor is an encoded position rather than a durable snapshot. Concurrent
inserts or updates can shift results between requests, so consumers should
treat `hasMore` and cursors as traversal hints.

## Messages, threads, and conversations

Message history, thread replies, direct conversations, and message search use
opaque base64url cursors containing time/ID ordering data. History and thread
pages are bounded at 50 records. Message history returns `{ items,
nextCursor }`; the UI reverses channel pages for chronological display.
Invalid cursors return a typed `INVALID_INPUT` action result. Access is checked
before pagination is applied.

## Notifications and activity

Notification listing uses an opaque time/ID cursor, an optional `unreadOnly`
filter, and a fixed page size of 30. It returns `{ items, nextCursor }`.
Activity and notification preferences are user/workspace scoped; the current
activity action returns a bounded list rather than exposing a public cursor
contract.

## Tasks and workflows

Task lists return at most 100 workspace-authorized tasks, ordered by status,
due date, and creation time. Workflow definitions and execution history return
at most 50 owner/workspace-scoped rows, ordered by update or creation time.
These actions currently have no cursor parameter. Consumers should not assume
that a full list is unbounded.

## Filtering and sorting

Filters are always applied inside the authorization query. Supported filters
include search result type, workspace/channel/user/date range, notification
unread state, and message destination. Sort order is feature-defined and is
not a client-controlled SQL/order expression. Unknown filters are rejected or
ignored according to the feature's existing validation contract.
