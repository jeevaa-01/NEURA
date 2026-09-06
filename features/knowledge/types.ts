export type KnowledgeIndexStatus =
  "PENDING" | "PROCESSING" | "READY" | "FAILED" | "DELETING";

export type KnowledgeSourceSummary = {
  id: string;
  workspaceId: string;
  channelId: string | null;
  channelName: string | null;
  name: string;
  type: "MANUAL_TEXT" | "FILE_UPLOAD";
  status: KnowledgeIndexStatus;
  errorMessage: string | null;
  chunkCount: number;
  lastIndexedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeCitation = {
  id: string;
  sourceId: string;
  documentId: string;
  title: string;
  sourceType: "MANUAL_TEXT" | "FILE_UPLOAD";
  channelId: string | null;
  channelName: string | null;
  chunkIndex: number;
};

export type KnowledgeSearchResult = KnowledgeCitation & {
  content: string;
  score: number;
};
