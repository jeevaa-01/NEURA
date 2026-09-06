import { createHash } from "node:crypto";

import { serverEnv } from "@/lib/validations/env";

export const SUPPORTED_FILE_TYPES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/plain": [".txt"],
  "text/markdown": [".md", ".markdown"],
} as const;

export type ValidatedFile = {
  fileName: string;
  mimeType: keyof typeof SUPPORTED_FILE_TYPES;
  extension: string;
  bytes: Buffer;
  checksum: string;
  textBearing: boolean;
};

function extension(fileName: string) {
  const value = fileName.toLowerCase();
  const index = value.lastIndexOf(".");
  return index > -1 ? value.slice(index) : "";
}

export function safeDisplayName(value: string) {
  const basename = value.replaceAll("\\", "/").split("/").at(-1) ?? "file";
  return (
    basename
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[^\w.()\- ]/g, "_")
      .trim()
      .slice(0, 160) || "file"
  );
}

function hasPrefix(bytes: Buffer, prefix: number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function signatureMatches(mimeType: string, bytes: Buffer) {
  if (mimeType === "image/png")
    return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/jpeg") return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/webp")
    return (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  if (mimeType === "image/gif")
    return (
      bytes.toString("ascii", 0, 6) === "GIF87a" ||
      bytes.toString("ascii", 0, 6) === "GIF89a"
    );
  if (mimeType === "application/pdf")
    return bytes.toString("ascii", 0, 5) === "%PDF-";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]);
  return true;
}

function validText(bytes: Buffer) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
    throw new Error("Text files may not contain binary control characters.");
  return text;
}

export async function validateUpload(file: File): Promise<ValidatedFile> {
  const config = serverEnv();
  const fileName = safeDisplayName(file.name);
  const ext = extension(fileName);
  const mimeType = file.type as keyof typeof SUPPORTED_FILE_TYPES;
  const allowedExtensions = SUPPORTED_FILE_TYPES[mimeType];
  if (!allowedExtensions || !allowedExtensions.includes(ext as never))
    throw new Error("That file type is not supported.");
  if (!file.size || file.size > config.FILE_MAX_BYTES)
    throw new Error(
      `Files must be smaller than ${Math.round(config.FILE_MAX_BYTES / 1024 / 1024)} MB.`,
    );
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!signatureMatches(mimeType, bytes))
    throw new Error("The file content does not match its declared type.");
  const textBearing =
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType === "application/pdf" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (mimeType === "text/plain" || mimeType === "text/markdown")
    validText(bytes);
  return {
    fileName,
    mimeType,
    extension: ext,
    bytes,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    textBearing,
  };
}
