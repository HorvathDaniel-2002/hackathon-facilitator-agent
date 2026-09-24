import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import { apiFailure, isStorageUnavailable } from "@/lib/api-errors";
import ApplicationError from "@/app/error";
import GlobalError from "@/app/global-error";

afterEach(() => vi.restoreAllMocks());

describe("safe page recovery", () => {
  it("shows retry, navigation and support reference without reflecting raw errors", () => {
    const html = renderToStaticMarkup(<ApplicationError error={Object.assign(new Error("sensitive query and token"), { digest: "support-42" })} retry={() => {}} />);
    expect(html).toContain("Try loading again");
    expect(html).toContain("Back to workspaces");
    expect(html).toContain("support-42");
    expect(html).not.toContain("sensitive query");
    expect(html).toContain("Do not reset");
  });
  it("handles root-layout failures with an independent document", () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("private stack")} retry={() => {}} />);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("private stack");
  });
  it.each(["P1001", "P1002", "P1008", "P1014", "P2021", "P2022"])("recognizes unavailable storage %s", (code) => {
    expect(isStorageUnavailable({ code })).toBe(true);
  });
  it("recognizes initialization errors without reflecting their connection string", () => {
    expect(isStorageUnavailable({ errorCode: "P1001", message: "private connection string" })).toBe(true);
  });
  it("does not log raw error messages or classify every failure as a storage outage", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(isStorageUnavailable(null)).toBe(false);
    const response = apiFailure(new Error("private token"), "test");
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.reference).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toContain("private token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private token");
  });
});
