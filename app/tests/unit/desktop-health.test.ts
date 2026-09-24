import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ access: vi.fn(), find: vi.fn() }));
vi.mock("@/lib/auth/desktop", () => ({ desktopRequestError: state.access }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: state.find } } }));
import { GET } from "@/app/api/desktop-health/route";

beforeEach(() => {
  vi.resetAllMocks();
  state.access.mockReturnValue(null);
  state.find.mockResolvedValue({ id: "synthetic-owner" });
});
describe("desktop readiness endpoint", () => {
  it("denies unauthenticated access before querying the database", async () => {
    state.access.mockReturnValue("Wrong local capability");
    const response = await GET(new Request("http://127.0.0.1:3199/api/desktop-health"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ready: false });
    expect(state.find).not.toHaveBeenCalled();
  });
  it("reports ready only for an initialized owner without returning identity or the token", async () => {
    const response = await GET(new Request("http://127.0.0.1:3199/api/desktop-health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ready: true });
  });
  it("reports a missing owner as unavailable, not a successful empty database", async () => {
    state.find.mockResolvedValue(null);
    const response = await GET(new Request("http://127.0.0.1:3199/api/desktop-health"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ready: false });
  });
  it("reports storage errors without exposing database content or credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      state.find.mockRejectedValue(new Error("Private connection data"));
      const response = await GET(new Request("http://127.0.0.1:3199/api/desktop-health"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ready: false });
      expect(log).toHaveBeenCalledWith("Desktop database readiness check failed.");
    } finally { log.mockRestore(); }
  });
});
