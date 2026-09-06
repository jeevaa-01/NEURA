# Files & Rich Media Architecture

Phase 15 adds bounded, private file attachments without changing NEURA’s
authentication, channel authorization, messaging, RAG, realtime, or
notification boundaries.

## Storage

`StorageProvider` is the application boundary for file bytes. The current
`LocalStorageProvider` writes outside `public` under `FILE_STORAGE_ROOT`, with
keys shaped as `<workspaceId>/<channelId>/<attachmentId>`. Physical names are
server-generated and never derived from the user filename. The interface has
`put`, `get`, `delete`, and `exists`, so S3, R2, MinIO, or another compatible
provider can replace the local implementation later.

## Supported files and limits

The initial allowlist is PNG, JPEG, WEBP, GIF, PDF, DOCX, TXT, and Markdown.
The server validates extension/MIME consistency, checks image/PDF/DOCX magic
bytes, rejects binary control characters in text files, normalizes display
names, and enforces configurable defaults of 25 MB per file, 10 files, and 50
MB total per upload request. Files are never executed or exposed as permanent
public URLs.

## Upload and access lifecycle

`POST /api/files/upload` authenticates the session, derives workspace scope from
the authorized channel, validates the multipart files, writes bytes, and
persists metadata. Database failure triggers storage cleanup. Attachment IDs
are temporary user-owned records until a message transaction attaches them;
that transaction rechecks uploader, workspace, channel, ownership, and one-time
attachment state.

`GET /api/files/[attachmentId]` rechecks the current user’s workspace and
channel access, rejects deleted messages/attachments, and streams with safe
content headers. Images and PDFs may render inline; other files download as
attachments. Message deletion marks attachments `DELETED` while retaining
bytes for future retention cleanup.

## RAG indexing

Text-bearing uploads move through `PENDING → PROCESSING → READY/FAILED`.
TXT/MD use the built-in UTF-8 decoder; PDF uses `pdf-parse`; DOCX uses
`mammoth`. Extracted text is passed through the existing Phase 11 chunker,
embedding service, and vector store, and creates a `KnowledgeSource` with
`FILE_UPLOAD` type. Indexing failure never rolls back or removes the original
attachment. `/api/files/[attachmentId]/retry` retries authorized indexing.

RAG scope inherits the attachment workspace/channel. Retrieval also excludes
deleted attachments, and the existing channel-access checks continue to gate
private content and citations.

## Messages, realtime, and notifications

Messages support text-only, attachment-only, and mixed content. The existing
message realtime event carries attachment metadata; no second file transport
was introduced. Existing mention, thread, and reaction notifications continue
to derive from the same authoritative message events.

## Security and future work

Client MIME, filename, workspace, channel, uploader, and attachment ownership
claims are treated as untrusted. Downloads are private and destination access
is authoritative. Cloud storage, antivirus, OCR, video/audio processing,
thumbnails, CDN delivery, background workers, and automatic retention cleanup
are intentionally deferred.
