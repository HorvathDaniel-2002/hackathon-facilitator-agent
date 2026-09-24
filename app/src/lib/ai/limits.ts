import { AiError } from "./errors";

export const MAX_CANVAS_FIELD_CHARS = 8_000;
export const MAX_CANVAS_CHARS = 40_000;
export const MAX_PROMPT_CHARS = 65_000;
export const MAX_OUTPUT_CHARS = 64_000;
export const MAX_COMPLETION_TOKENS = 8_192;
export const GENERATION_TIMEOUT_MS = 120_000;

export function assertPromptSize(system: string, user: string): void {
  if (system.length + user.length > MAX_PROMPT_CHARS) {
    throw new AiError("The AI input is too large. Shorten the use-case canvas.", 400);
  }
}

export function positiveLimit(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new AiError(`${name} must be a positive integer no greater than ${maximum}.`, 503);
  }
  return value;
}
