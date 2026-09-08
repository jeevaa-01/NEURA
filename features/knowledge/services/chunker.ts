import { getKnowledgeConfig } from "./config";
import { KnowledgeError } from "./errors";

export type TextChunk = {
  content: string;
  chunkIndex: number;
  characterCount: number;
  tokenCount: number;
};

function splitLongParagraph(paragraph: string, size: number, overlap: number) {
  const pieces: string[] = [];
  let start = 0;
  while (start < paragraph.length) {
    let end = Math.min(start + size, paragraph.length);
    if (end < paragraph.length) {
      const boundary = paragraph.lastIndexOf(" ", end);
      if (boundary > start + Math.floor(size * 0.6)) end = boundary;
    }
    const piece = paragraph.slice(start, end).trim();
    if (piece) pieces.push(piece);
    if (end >= paragraph.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return pieces;
}

export function chunkDocument(text: string): TextChunk[] {
  const config = getKnowledgeConfig();
  const overlap = Math.min(
    config.chunkOverlap,
    Math.floor(config.chunkSize / 3),
  );
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (!current) return;
    chunks.push(current.trim());
    current = current.slice(-overlap);
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > config.chunkSize) {
      flush();
      current = "";
      chunks.push(...splitLongParagraph(paragraph, config.chunkSize, overlap));
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > config.chunkSize) flush();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();

  const result = chunks.filter(Boolean).map((content, chunkIndex) => ({
    content,
    chunkIndex,
    characterCount: content.length,
    tokenCount: Math.ceil(content.length / 4),
  }));
  if (!result.length)
    throw new KnowledgeError(
      "KNOWLEDGE_INVALID_INPUT",
      "The source produced no searchable text.",
    );
  if (result.length > config.maxChunks)
    throw new KnowledgeError(
      "KNOWLEDGE_LIMIT_EXCEEDED",
      `Sources can contain at most ${config.maxChunks} searchable chunks.`,
    );
  return result;
}
