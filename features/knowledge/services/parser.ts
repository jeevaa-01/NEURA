import { KnowledgeError } from "./errors";
import { getKnowledgeConfig } from "./config";

export type ParsedDocument = {
  title: string;
  mimeType: "text/plain" | "text/markdown";
  text: string;
  metadata: { parser: "manual-text"; characterCount: number };
};

export interface DocumentParser {
  parse(input: {
    title: string;
    mimeType: string;
    content: string;
  }): ParsedDocument;
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class ManualTextParser implements DocumentParser {
  parse(input: { title: string; mimeType: string; content: string }) {
    if (input.mimeType !== "text/plain" && input.mimeType !== "text/markdown")
      throw new KnowledgeError(
        "KNOWLEDGE_INVALID_INPUT",
        "Only plain text and Markdown sources are supported.",
      );
    const text = normalizeText(input.content);
    if (!text)
      throw new KnowledgeError(
        "KNOWLEDGE_INVALID_INPUT",
        "The source is empty.",
      );
    const config = getKnowledgeConfig();
    if (text.length > config.maxDocumentCharacters)
      throw new KnowledgeError(
        "KNOWLEDGE_LIMIT_EXCEEDED",
        `Sources must be ${config.maxDocumentCharacters.toLocaleString()} characters or shorter.`,
      );
    const mimeType: ParsedDocument["mimeType"] = input.mimeType;
    return {
      title: input.title.trim().slice(0, 120),
      mimeType,
      text,
      metadata: { parser: "manual-text" as const, characterCount: text.length },
    };
  }
}

export const documentParser: DocumentParser = new ManualTextParser();
