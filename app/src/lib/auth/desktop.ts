import { timingSafeEqual } from "node:crypto";

/** A per-launch desktop capability, not a corporate identity or network login. */
export function desktopRequestError(requestHeaders: Headers): string | null {
  const token = process.env.HF_DESKTOP_SESSION_TOKEN;
  if (process.env.AUTH_MODE !== "desktop-local" || process.env.HF_DESKTOP_PACKAGE !== "1" ||
      !["production", "test"].includes(process.env.NODE_ENV ?? "") ||
      process.env.AI_PROVIDER !== "mock" || !token || !/^[a-f0-9]{64}$/.test(token)) {
    return "The local desktop session is not configured. Close and reopen the desktop application.";
  }
  let expected: URL;
  try { expected = new URL(process.env.APP_URL ?? ""); }
  catch { return "The desktop listener configuration is invalid."; }
  if (expected.protocol !== "http:" || expected.hostname !== "127.0.0.1" ||
      !expected.port || expected.username || expected.password ||
      expected.pathname !== "/" || expected.search || expected.hash ||
      requestHeaders.get("host") !== expected.host) {
    return "Desktop access is restricted to its local listener.";
  }
  const forwarded = requestHeaders.get("x-forwarded-host");
  const origin = requestHeaders.get("origin");
  if ((forwarded && forwarded !== expected.host) || (origin && origin !== expected.origin) ||
      requestHeaders.get("sec-fetch-site") === "cross-site") {
    return "Cross-origin desktop requests are not allowed.";
  }
  const supplied = requestHeaders.get("x-hf-desktop-token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(token, "ascii"), Buffer.from(supplied, "ascii"))) {
    return "Open this workspace in the desktop application.";
  }
  return null;
}
