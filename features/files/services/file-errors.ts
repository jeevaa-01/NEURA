const SAFE_FILE_ERROR_PATTERNS = [
  /[A-Za-z]:[\\/]/,
  /(?:^|[\\/])(?:home|tmp|var|node_modules)(?:[\\/]|$)/i,
  /\/(?:[^/\s]+\/){2,}/,
  /\b(?:ENOENT|EACCES|EPERM|Prisma|secret|token|api key|storage)\b/i,
];

/** Keep filesystem, database, and provider details out of API responses. */
export function safeFileError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (
    !message ||
    message.length > 180 ||
    SAFE_FILE_ERROR_PATTERNS.some((pattern) => pattern.test(message))
  )
    return fallback;
  return message;
}
