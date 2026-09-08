# NEURA API Authorization Matrix

All authenticated rows below derive `userId` from the active Better Auth
session. Client-provided user, owner, or membership IDs are treated as target
data only and never as proof of authority.

| Surface | Operation | Auth | Scope | Authorization | Sensitive data | Rate limit |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/health` | GET | Anonymous | Process dependencies | None | Dependency availability/latency only | None |
| `/api/auth/*` | GET/POST | Public or auth flow | Auth library request | Better Auth policy | Credential/session data | Configured credential operations; fail-closed Redis |
| `/api/search` | GET | User | Accessible workspaces/channels | Active membership and private-channel access | Search snippets and metadata | 60/user/minute; `429` + `Retry-After` |
| `/api/ai/chat` | POST | User | Requested workspace/context | Active workspace membership, channel/conversation access | User/workspace context and provider output | AI limiter; fail-closed Redis |
| `/api/files/upload` | POST | User | Requested channel | Channel access, including private membership | File bytes and metadata | 20/user/minute |
| `/api/files/{id}` | GET | User | Attachment's workspace/channel | Attachment access; unauthorized/missing are both `404` | Private file bytes | No route limiter; authorization is mandatory |
| `/api/files/{id}/retry` | POST | User | Attachment/source | Original uploader and channel access | Indexing state | 10/user/minute |
| `/api/account/avatar` | POST/DELETE | User | Own account | Session user only | Avatar bytes | 10/user/minute; fail-closed |
| `/api/account/avatar/{id}` | GET | User | Own current avatar | Version/path must match active session user's stored avatar | Private image bytes | No route limiter; private authorization |
| `/api/realtime` | GET | User | One channel or conversation | Channel membership/private access or conversation membership | Messages, presence, typing | 30 connections/user/minute; fail-closed |
| `/api/realtime/notifications` | GET | User | Own notification topic | Session user ID is the topic key | Own notification events | 30 connections/user/minute; fail-closed |
| Workspace actions | Create/update/delete/membership/invites | User | One workspace | Owner/admin/active member rules per operation | Workspace and member data | Existing action-specific controls; no new limiter added |
| Channel actions | CRUD/membership/archive/favorite | User | One workspace/channel | Active workspace role and channel/private membership | Private channel data | Existing action controls |
| Message actions | Send/edit/delete/read/thread/reaction | User | Channel or conversation | Channel access, conversation membership, author/manager mutation rules | Message content/attachments | Existing action controls |
| Task actions | CRUD/status/assignment | User | One workspace/task | Active member; creator/owner/admin mutations; assignee status-only | Task details | Session/workspace checks; no separate limiter |
| Workflow actions | Definition CRUD/status/run/history | User | One workspace/workflow/execution | Existing workflow owner plus active workspace membership | Definitions, execution results | AI rate limit for create/update/status/run/validation |
| Knowledge actions | Source CRUD/retry/retrieval | User | Workspace/source/channel | Active workspace and channel access | Indexed document content/citations | Existing AI/indexing limits |
| AI actions | Propose/confirm/execute/cancel | User | Workspace/conversation/action | Action owner, workspace authorization, confirmation-time reauthorization | Tool payload/results | AI limiter; confirmation required for writes |
| Profile/preferences | Update own profile/preferences | User | Own account | Session user only | Profile/preferences | Profile 30/min; account controls fail-closed |
| Account deactivation | Deactivate own account | User | Own account | Session user only | Sessions/account state | 3/5 minutes; fail-closed |

## Important boundaries

- Workspace membership must be `ACTIVE`; suspended/left memberships do not
  authorize access.
- Private channels require channel membership unless the user is a workspace
  owner/admin under the existing channel policy.
- Files and avatars intentionally return not-found behavior for unauthorized
  resources to avoid existence disclosure.
- Task assignees must be active members of the same workspace. Cross-workspace
  task IDs are scoped out at the query.
- Workflow execution revalidates the workspace, tool registration, tool input,
  and confirmation state at execution/resume time.
- Realtime topics are channel-, conversation-, or user-scoped. There is no
  workspace-wide task/workflow stream.
