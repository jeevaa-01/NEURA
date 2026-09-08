# NEURA Agent & Workflow Architecture

Phase 13 adds bounded workflows on top of the Phase 10 orchestrator and Phase
12 governed action/tool system. An agent in this phase is a server-controlled,
sequential workflow executor, not an unrestricted autonomous program.

## Boundary and models

The workflow feature owns structured definitions and execution state. Its
repository is the only layer in the feature that talks to Prisma:

`Workflow -> WorkflowExecution -> WorkflowStepExecution`

Workflow owners can create, read, list, update, enable, disable, and archive
definitions through validated Server Actions. Archive maps to `DISABLED` rather
than a physical delete so execution history and step details remain readable.
Re-enabling revalidates the stored definition, and execution still rejects any
workflow that is not `READY`.

`Workflow` stores a validated `{ trigger, steps }` definition and is scoped to
one workspace and creator. `WorkflowExecution` stores the initiating user,
conversation link, lifecycle, current step, timing, failure and result summary.
`WorkflowStepExecution` stores the stable step index, governed tool name,
validated input, status, result summary/payload, timestamps, error and optional
Phase 12 `AIAction` link.

The `workspace_tasks` foundation from Phase 12 is reused. No second task
system, provider, authorization layer, or realtime transport is introduced.

## Lifecycle

Workflow definitions are `DRAFT`, `READY` or `DISABLED`; only `READY` can run.
Executions use the explicit state machine:

`READY -> RUNNING -> WAITING_CONFIRMATION -> RUNNING -> SUCCEEDED`

`FAILED`, `CANCELLED` and `EXPIRED` are terminal states. Steps use `PENDING`,
`RUNNING`, `WAITING_CONFIRMATION`, `SUCCEEDED`, `FAILED`, `SKIPPED` and
`CANCELLED`. The server owns all transitions; client status values are never
accepted as authority.

## Planning and validation

Users can create structured plans from the Agents page using small templates,
or ask the existing OpenAI provider for a JSON-only AI plan. The planner has no
tools and receives only bounded, authorized context marked as untrusted data;
it cannot decide permissions, limits or confirmation policy. The server then
validates the complete plan against the existing Phase 12 registry before any
execution row is created. Unknown tools, invalid schemas, destructive tools,
over-limit plans, and unauthorized/private-channel references are rejected as
a whole.

The initial templates cover:

- authorized channel retrieval and summary context;
- message search followed by a confirmation-gated task;
- channel retrieval and summary context followed by a confirmation-gated
  knowledge-document index.

Simple `{{step.N.result}}` references are resolved only on the server from
bounded prior results. They are not executable instructions and cannot change
the registry or policy.

## Execution and Phase 12 integration

The engine executes steps in order. Before every step it re-authenticates,
re-checks workspace membership, validates target channel access, validates the
tool schema and checks current tool policy. Read steps call Phase 12's governed
read executor. Write steps call Phase 12's `proposeAIAction` with a stable
`executionId:stepIndex` idempotency key. They pause the workflow and reuse the
existing action confirmation/execution server actions. After a confirmed write,
the workflow resumes and verifies the stored server result before continuing.

No workflow path writes directly to messages, channels, knowledge or tasks.
The only database access from the workflow feature is persistence through its
repository, while domain mutations remain inside the existing tool/action
executors.

## Limits and failure behavior

The initial limits are five steps, ten maximum tool calls, one retry policy
(automatic retries are not enabled in this synchronous slice), zero nested
workflow depth, bounded 12,000-character step results, and a 60-second
execution window. There is no loop, recursion, cron, scheduler, worker,
distributed queue, arbitrary scripting, shell, browser or external HTTP tool.

Execution claims are conditional, so concurrent starts cannot run the same
pending execution twice. Phase 12 action idempotency prevents duplicate writes
when a workflow resumes or a request is repeated. A failed step is persisted,
later pending steps are marked `SKIPPED`, and the final summary reports the
number of successful steps and the exact safe failure message. Successful
unrelated writes are not rolled back.

## Confirmation, audit and privacy

All current Phase 12 writes require confirmation, including messages, channels,
knowledge documents and tasks. Workflow confirmation pauses before the first
write-bearing step. The UI shows the workflow execution step list and the
existing action preview; only an action ID is sent to confirm or execute.

Workflow creation, start, step start/completion, confirmation wait, failure,
cancellation and completion are recorded in `AIAuditLog` with workflow,
execution, step and tool identifiers. Audit metadata contains no API keys,
tokens, passwords, hidden prompts or full message/document bodies.

Users see their own workspace-scoped workflow definitions and executions.
Private-channel retrieval still uses the existing channel membership service;
retrieved content is data and cannot grant access, alter limits or invoke an
unknown tool.

## Realtime and current limitations

Message mutations reuse existing Phase 9/Phase 8 realtime publication. The
current realtime topic is channel-scoped, while workflow executions are
workspace-scoped and may not have a channel, so workflow status is returned by
server actions and refreshed from authoritative execution reads rather than
adding a mismatched topic. A future workspace event topic can expose
`workflow.started`, `workflow.step.completed`, `workflow.failed` and
`workflow.completed` without changing the execution contract.

Scheduled/background triggers, recurring workflows, parallel/DAG execution,
multi-user approvals, task assignment, rich AI analysis between steps,
rollback/compensation and a visual editor are intentionally deferred.
