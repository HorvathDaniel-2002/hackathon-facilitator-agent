import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopRequestError } from "@/lib/auth/desktop";

const token = "a".repeat(64);
let headers: Headers;
beforeEach(() => {
  vi.stubEnv("AUTH_MODE", "desktop-local");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AI_PROVIDER", "mock");
  vi.stubEnv("HF_DESKTOP_PACKAGE", "1");
  vi.stubEnv("HF_DESKTOP_SESSION_TOKEN", token);
  vi.stubEnv("APP_URL", "http://127.0.0.1:3199");
  headers = new Headers({ host: "127.0.0.1:3199", "x-hf-desktop-token": token });
});
afterEach(() => vi.unstubAllEnvs());
describe("packaged desktop capability", () => {
  it("accepts a token-authenticated request to the exact loopback listener", () => {
    expect(desktopRequestError(headers)).toBeNull();
    headers.set("origin", "http://127.0.0.1:3199");
    expect(desktopRequestError(headers)).toBeNull();
  });
  it.each(["", "b".repeat(64), "a".repeat(63), "a".repeat(65), "é".repeat(64)])("rejects missing or wrong capability: %s", supplied => {
    headers.set("x-hf-desktop-token", supplied);
    expect(desktopRequestError(headers)).not.toBeNull();
  });
  it.each(["localhost:3199", "127.0.0.1:3200", "evil.test", "0.0.0.0:3199"])("rejects another Host: %s", host => {
    headers.set("host", host);
    expect(desktopRequestError(headers)).not.toBeNull();
  });
  it("rejects remote origins and forwarded hosts even with the capability", () => {
    headers.set("origin", "https://untrusted.example");
    expect(desktopRequestError(headers)).not.toBeNull();
    headers.delete("origin");
    headers.set("x-forwarded-host", "untrusted.example");
    expect(desktopRequestError(headers)).not.toBeNull();
    headers.delete("x-forwarded-host");
    headers.set("sec-fetch-site", "cross-site");
    expect(desktopRequestError(headers)).not.toBeNull();
  });
  it.each([
    ["AUTH_MODE", "dev"], ["HF_DESKTOP_PACKAGE", ""], ["HF_DESKTOP_SESSION_TOKEN", ""],
    ["NODE_ENV", "development"], ["AI_PROVIDER", "azure-openai"],
    ["APP_URL", "https://127.0.0.1:3199"], ["APP_URL", "http://0.0.0.0:3199"],
    ["APP_URL", "http://127.0.0.1:3199/other"],
  ])("fails closed for incompatible %s", (name, value) => {
    vi.stubEnv(name, value);
    expect(desktopRequestError(headers)).not.toBeNull();
  });
});
