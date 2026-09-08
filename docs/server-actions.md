# NEURA Server Action Contracts

## Scope and calling convention

NEURA uses Next.js Server Actions for most authenticated domain operations.
They are not public REST endpoints and should be called through the exported
feature action modules. Actions validate their input on the server, derive the
actor from the Better Auth session, and normally return:

```ts
{ ok: true, data: value } | { ok: false, error: { code, message } }
```

The profile and account-lifecycle actions retain their older `{ ok, message }`
shape. No action accepts a client-supplied actor ID as an authority signal.

## Workspace and membership

| Action group | Purpose and important inputs | Authorization and side effects |
| --- | --- | --- |
| `createWorkspaceAction` | `name`, optional `description`, optional `iconUrl` | Authenticated user; creates the workspace, owner membership, and default channels. |
| `updateWorkspaceAction` | `workspaceId`, optional name/description/icon | Active workspace owner or admin; revalidates workspace pages. |
| `deleteWorkspaceAction` | `workspaceId` | Owner-only destructive workspace operation; protected by the workspace service. |
| `leaveWorkspaceAction` | `workspaceId` | Active member; owners must transfer ownership or delete the workspace first. |
| `updateMemberRoleAction` | member ID and role | Owner/admin rules are enforced by the membership service; ownership transfer is separate. |
| `removeMemberAction` | member ID | Owner/admin rules; owner removal is rejected. |
| `transferOwnershipAction` | workspace/member target | Owner-only ownership transfer. |
| `createInvitationAction`, `resendInvitationAction`, `revokeInvitationAction` | workspace and invite email/token data | Workspace management permissions; invitation expiry, revocation, and duplicate checks apply. |
| `acceptInvitationAction`, `declineInvitationAction` | invitation token/id | Authenticated recipient and invitation state are checked. |

Workspace IDs are always checked against the authenticated user's active
membership. Membership rows with `SUSPENDED` or `LEFT` status do not grant
access.

## Channels

`createChannelAction`, `updateChannelAction`, `archiveChannelAction`,
`deleteChannelAction`, `addChannelMemberAction`, and
`removeChannelMemberAction` validate channel/workspace IDs and use the existing
workspace-role and channel-access services. Public/private visibility,
archived-channel rules, protected default channels, reserved names, and private
channel membership are enforced server-side. Channel mutations publish the
existing authorized channel realtime events where applicable.

## Messaging, threads, reactions, and favorites

| Actions | Contract |
| --- | --- |
| `createMessageAction` | Requires exactly one `channelId` or `conversationId`; content is bounded at 4,000 characters, control characters are rejected, and up to 10 attachment IDs may be supplied. Channel/conversation access is checked. |
| `updateMessageAction` | Requires the message ID and bounded content; only the author or an authorized channel manager can edit. |
| `deleteMessageAction` | Requires the message ID; author/manager authorization applies and the existing message deletion/realtime behavior is preserved. |
| `loadChannelMessagesAction`, `getThreadAction`, `getReadStateAction` | Read authorized channel/conversation history using opaque cursors and bounded pages. |
| `searchMessagesAction` | Workspace/channel-scoped message search with bounded query and cursor. |
| `addReactionAction`, `removeReactionAction` | Validated emoji and message ID; message access and duplicate reaction rules apply. |
| `markChannelReadAction` | Updates read state only for an authorized channel or conversation. |
| `toggleFavoriteChannelAction` | Adds/removes the authenticated user's favorite for an accessible channel. |
| `startDirectConversationAction`, `listDirectConversationsAction`, `listWorkspacePeopleAction` | Authenticated user-scoped direct-message discovery and creation; conversation membership is enforced. |

Successful message mutations persist first, then publish authorized channel or
conversation events. Redis/realtime failure does not roll back the database
mutation. Mentions, reactions, thread replies, and notifications use the
existing notification/activity services.

## Tasks

`createTaskAction`, `listTasksAction`, `getTaskAction`, `updateTaskAction`, and
`deleteTaskAction` are implemented in `features/tasks`.

- Inputs include `workspaceId`, task ID where applicable, title (1–200),
  description (up to 2,000), ISO due date, active-member `assigneeId`, and
  `OPEN`/`DONE` status.
- Identity is session-derived. The service checks active workspace membership,
  workspace ownership of the task, and active same-workspace assignment.
- Creators and workspace owners/admins can edit/delete. An assignee may change
  only status. Delete is a scoped hard delete; search no longer finds the row.
- Create emits the existing assignment/activity event. Updates notify task
  participants according to notification preferences.
- Priority is not accepted because the current schema has no priority field.

## Workflows and executions

`createWorkflowAction`, `listWorkflowsAction`, `getWorkflowAction`,
`updateWorkflowAction`, `setWorkflowStatusAction`, `deleteWorkflowAction`,
`runWorkflowAction`, `listWorkflowExecutionsAction`,
`getWorkflowExecutionAction`, `cancelWorkflowExecutionAction`, and
`resumeWorkflowAfterActionAction` cover definition and execution management.

Workflow definitions require 1–5 steps, registered tools, validated tool
arguments, and valid prior-step references. Workflow owners are the existing
authorization boundary. `READY` workflows can run; `DISABLED` workflows are
rejected. Delete/archive sets `DISABLED` so execution and step history remain
available. Runs retain the existing 10-call/60-second bounds, confirmation
gates for writes, per-step reauthorization, and idempotency keys.

## Knowledge

`createKnowledgeSourceAction`, `listKnowledgeSourcesAction`,
`retryKnowledgeSourceAction`, and `deleteKnowledgeSourceAction` manage
workspace-scoped manual/file sources. Source creation and deletion require
workspace access; channel-scoped sources additionally require channel access.
Ingestion validates content, chunks and indexes it, and records bounded status
and safe error information. Retrieval returns only authorized sources and
citations. File-backed indexing uses the file service and configured provider.

## AI, actions, and automation

AI conversation actions include `createAIConversationAction`,
`listAIConversationsAction`, `getAIConversationAction`,
`renameAIConversationAction`, and `deleteAIConversationAction`.

Governed action actions include `listAIActionsAction`, `confirmAIActionAction`,
`executeAIActionAction`, and `cancelAIActionAction`. Write tools are proposed,
confirmed, reauthorized, and executed with server-owned identity and
idempotency. The registered tool set does not expose arbitrary shell, SQL,
browser, or unrestricted HTTP execution.

`runAutomationAction` accepts a bounded plan (maximum three steps) and reuses
the same registered-tool, validation, rate-limit, and confirmation path.
Workflow actions use the separate maximum-five-step bounded executor.

## Profile, settings, avatar, and account lifecycle

- `updateProfileAction` derives the user from the session, validates display
  name/username/bio/status text, applies a profile rate limit, and returns the
  legacy `{ ok, message, field? }` result shape.
- Notification actions list/read notifications, mark all read, list activity,
  read preferences, and update preference flags. Results are user-scoped.
- Avatar upload/delete are HTTP routes documented in `openapi.yaml`; the
  server-side avatar service validates content and keeps avatar references
  private.
- `deactivateAccountAction` derives the user, applies a fail-closed rate limit,
  deactivates the account and deletes its sessions transactionally. It returns
  `{ ok: true }` or `{ ok: false, message }`.

## Error and side-effect rules

Invalid action input returns `INVALID_INPUT` without database mutation.
Authorization and missing-resource behavior is mapped to the feature's typed
error codes. Internal database/provider details are redacted. See
[API_ERRORS.md](API_ERRORS.md), [API_AUTHORIZATION_MATRIX.md](API_AUTHORIZATION_MATRIX.md),
and [API_SECURITY.md](API_SECURITY.md).
