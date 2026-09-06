export const SEARCH_FILTER_TYPES = [
  "all",
  "messages",
  "threads",
  "channels",
  "people",
  "files",
  "knowledge",
  "tasks",
] as const;

export type SearchFilterType = (typeof SEARCH_FILTER_TYPES)[number];

export type SearchResultType =
  | "message"
  | "thread"
  | "channel"
  | "person"
  | "file"
  | "knowledge"
  | "task"
  | "workspace";

export type SearchResultContext = {
  id: string;
  name: string;
  slug: string;
};

export type SearchResultAuthor = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
};

export type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  snippet: string;
  timestamp: string | null;
  workspace: SearchResultContext | null;
  channel: (SearchResultContext & { isPrivate: boolean }) | null;
  author: SearchResultAuthor | null;
  relevance: number;
  href: string;
  metadata: Record<string, boolean | number | string | null>;
};

export type SearchResponse = {
  query: string;
  items: SearchResult[];
  nextCursor: string | null;
  hasMore: boolean;
};
