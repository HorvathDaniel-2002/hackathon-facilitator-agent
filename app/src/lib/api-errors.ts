import { randomUUID } from "node:crypto";

export function storageErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = "code" in error ? error.code : "errorCode" in error ? error.errorCode : null;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : null;
}

export function isStorageUnavailable(error: unknown): boolean {
  const code = storageErrorCode(error);
  return code !== null && ["P1001", "P1002", "P1008", "P1014", "P2021", "P2022"].includes(code);
}

/** Only correlation metadata belongs in logs; database errors can contain full records. */
export function apiFailure(error: unknown, operation: string): Response {
  const reference = randomUUID();
  const unavailable = isStorageUnavailable(error);
  console.error("Application request failed", { operation, reference, code: storageErrorCode(error) });
  return Response.json({
    error: unavailable
      ? "Application storage is unavailable or requires a reviewed schema update. Ask the app owner; do not reset the database."
      : "The request could not be completed. Retry, or give the app owner the reference below.",
    reference,
  }, {
    status: unavailable ? 503 : 500,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
