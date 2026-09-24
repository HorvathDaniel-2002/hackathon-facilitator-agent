export class AiError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "AiError";
  }
}

/** Provider errors may contain request bodies or credentials: never surface them. */
export function safeAiError(error: unknown): AiError {
  return error instanceof AiError
    ? error
    : new AiError("AI generation failed. Check the service configuration and retry.");
}
