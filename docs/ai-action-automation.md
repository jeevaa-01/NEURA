# NEURA AI Action & Automation Engine

Phase 12 extends the Phase 10 orchestrator and Phase 11 knowledge tools with explicit, confirmation-gated workspace actions. There is one AI tool registry, one server-side executor boundary, the existing session/role authorization layer, the existing AI rate limit, and the existing realtime bus.

## Tool catalog

Read tools are available to the model for the current authorized workspace:

- `get_workspace_info`
- `list_channels`
- `get_channel_info`
- `search_messages`
- `get_recent_messages`
- `search_knowledge`
- `summarize_channel`

Write tools are explicit and currently limited to:

- `create_message`
- `create_channel`
- `update_channel`
- `create_knowledge_document`
- `create_task`

Each registry entry has a stable name, description, JSON schema, read/write kind, risk class, confirmation policy, and server executor. Destructive tools are not registered. Tool arguments never include a trusted `userId` or `workspaceId`; workspace scope comes from the prepared request and is checked again at execution.

## Lifecycle and confirmation

Every write request becomes one `ai_actions` row with the lifecycle:

`PROPOSED -> AWAITING_CONFIRMATION -> APPROVED -> EXECUTING -> SUCCEEDED`

Failure, cancellation, and expiry are terminal alternatives. Proposals expire after ten minutes. The AI stream emits `action.proposed` with a server-built summary; the UI displays the target and intended change, then sends only the action ID when the user confirms or cancels.

The execution service re-reads the action, authenticates the current session, re-checks workspace membership, channel access, and manager roles, and claims `APPROVED -> EXECUTING` with a conditional update. A second execution request therefore returns the stored success or an in-progress result instead of performing the write again. The idempotency key also prevents duplicate proposals when a provider request is retried.

All lifecycle transitions write a minimized `AIAuditLog` entry containing the action ID, tool name, and status. Raw credentials, provider responses, and unnecessary message/document bodies are not written to the audit log.

## Automation boundary

`runSequentialAutomation` is a small synchronous plan runner for trusted server callers. It accepts at most three steps, executes them sequentially, has a 45-second wall-clock limit, and has no recursion, loops, scheduler, worker, or background queue. Read steps execute normally. A write step stops and creates a normal confirmation-gated `AIAction`; it cannot silently mutate the workspace.

This is intentionally not a general agent runtime. Scheduling, recurring jobs, bulk fan-out, and destructive operations remain out of scope until they have a separate product and security review.

## Realtime and UI behavior

`create_message` delegates to the existing Phase 8 message service, so the existing `message.created` or `thread.reply.created` event is preserved. Channel and knowledge mutations use the existing server-action refresh and authoritative reads; no second realtime system is introduced. The `/app/ai` panel includes the preview, confirmation controls, status/result/error, and a recent action history.

## Task foundation

Because NEURA had no task domain before Phase 12, `workspace_tasks` provides the smallest useful foundation: title, description, open/done status, optional due date, workspace, and creator. `create_task` creates only for the authenticated actor and does not implement task assignment, notifications, scheduling, or recurrence.

## Operational notes

Apply migration `20260906100000_ai_action_automation_engine` before using write actions. The existing AI rate limiter remains the request boundary. Provider tool output continues to be bounded before it is returned for continuation. No OpenAI key, authenticated account, or indexed source is required to build or type-check this phase; live provider and confirmation smoke tests require those deployment prerequisites.
