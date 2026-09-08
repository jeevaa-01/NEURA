// E2E is intentionally opt-in. Trimming supports the common Windows cmd form
// `set RUN_E2E=1 && ...`, which includes the separator space in the value.
// eslint-disable-next-line no-restricted-syntax
export const runE2E = process.env.RUN_E2E?.trim() === "1";

// Only expose a boolean to tests; the provider credential itself never enters
// the browser or test output.
// eslint-disable-next-line no-restricted-syntax
export const liveAIConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
