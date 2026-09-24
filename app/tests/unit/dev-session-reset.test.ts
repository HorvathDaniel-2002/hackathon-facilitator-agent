import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ clearDevSession: vi.fn(), AccessDeniedError: class extends Error {} }));
vi.mock("@/lib/auth", () => auth);
import { POST } from "@/app/api/dev-session/reset/route";

beforeEach(() => { vi.resetAllMocks(); });

describe("local session recovery boundary", () => {
  it("clears only this browser's demo session on an allowed same-origin POST", async () => {
    const response = await POST(new Request("http://localhost/api/dev-session/reset", { method: "POST", headers: { origin: "http://localhost" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cleared: true });
    expect(auth.clearDevSession).toHaveBeenCalledOnce();
  });
  it.each([null, "https://external.example"])("rejects missing or cross-origin recovery requests %s", async (origin) => {
    const response = await POST(new Request("http://localhost/api/dev-session/reset", { method: "POST", headers: origin ? { origin } : {} }));
    expect(response.status).toBe(403);
    expect(auth.clearDevSession).not.toHaveBeenCalled();
  });
  it("does not expose auth details when recovery is unavailable", async () => {
    auth.clearDevSession.mockRejectedValue(new auth.AccessDeniedError("private configuration details"));
    const response = await POST(new Request("http://localhost/api/dev-session/reset", { method: "POST", headers: { origin: "http://localhost" } }));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("private");
  });
});
