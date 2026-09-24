import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(), cookieSet: vi.fn(),
  userFind: vi.fn(), usersFind: vi.fn(), membershipFind: vi.fn(),
  requestHeaders: new Headers({ host: "localhost:3000" }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }),
  headers: async () => mocks.requestHeaders,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFind, findMany: mocks.usersFind },
    membership: { findUnique: mocks.membershipFind },
  },
}));

const seeded = { id: "seeded-owner", name: "Dana Reyes", email: "facilitator@example.com", globalRole: "Admin", entraOid: null };

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("AUTH_MODE", "dev");
  vi.stubEnv("NODE_ENV", "test");
  mocks.requestHeaders = new Headers({ host: "localhost:3000" });
  mocks.userFind.mockResolvedValue(seeded);
  mocks.usersFind.mockResolvedValue([seeded]);
  mocks.membershipFind.mockResolvedValue({ role: "Owner" });
});
afterEach(() => vi.unstubAllEnvs());

describe("fail-closed development identity", () => {
  it("uses only the named seed fixture as the local default", async () => {
    const { getCurrentUser } = await import("@/lib/auth");
    expect(await getCurrentUser()).toMatchObject({ id: seeded.id });
    expect(mocks.userFind).toHaveBeenCalledWith({ where: { email: seeded.email } });
  });

  it.each([undefined, "", "anything"])("rejects missing or invalid auth mode %s", async (mode) => {
    vi.stubEnv("AUTH_MODE", mode);
    const { getCurrentUser } = await import("@/lib/auth");
    await expect(getCurrentUser()).rejects.toThrow("Configure AUTH_MODE");
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it.each([undefined, "phase-production-build"])("rejects dev identities in production even during %s", async (phase) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", phase);
    const { getCurrentUser, setDevUser, listDevUsers } = await import("@/lib/auth");
    await expect(getCurrentUser()).rejects.toThrow("Refusing to serve");
    await expect(setDevUser(seeded.id)).rejects.toThrow();
    await expect(listDevUsers()).rejects.toThrow();
  });

  it("never falls back to dev identity in unconfigured Entra mode", async () => {
    vi.stubEnv("AUTH_MODE", "entra");
    const { getCurrentUser, setDevUser, listDevUsers } = await import("@/lib/auth");
    await expect(getCurrentUser()).rejects.toThrow("Entra authentication is not configured");
    await expect(setDevUser(seeded.id)).rejects.toThrow();
    await expect(listDevUsers()).rejects.toThrow();
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it.each(["app.contoso.com", "localhost.attacker.com", "192.168.0.1", "", "localhost:3000,evil.test"])("rejects non-loopback Host %s", async (host) => {
    mocks.requestHeaders = new Headers({ host });
    const { getCurrentUser } = await import("@/lib/auth");
    await expect(getCurrentUser()).rejects.toThrow("localhost");
  });

  it.each(["localhost:4000", "127.0.0.1:3000", "[::1]:3000"])("supports local test hosts %s", async (host) => {
    mocks.requestHeaders = new Headers({ host });
    const { getCurrentUser } = await import("@/lib/auth");
    expect(await getCurrentUser()).not.toBeNull();
  });

  it("rejects proxy and cross-origin requests", async () => {
    const { getCurrentUser } = await import("@/lib/auth");
    mocks.requestHeaders.set("x-forwarded-host", "external.example");
    await expect(getCurrentUser()).rejects.toThrow();
    mocks.requestHeaders.delete("x-forwarded-host");
    mocks.requestHeaders.set("origin", "https://external.example");
    await expect(getCurrentUser()).rejects.toThrow("origin");
  });

  it.each([
    { ...seeded, id: "invite", email: "invited@example.com" },
    { ...seeded, name: "facilitator" },
    { ...seeded, entraOid: "entra-id" },
    { ...seeded, globalRole: "Whatever" },
  ])("prevents non-seeded/invited identity login %j", async (user) => {
    mocks.cookieGet.mockReturnValue({ value: user.id });
    mocks.userFind.mockResolvedValue(user);
    mocks.usersFind.mockResolvedValue([user, seeded]);
    const { getCurrentUser, setDevUser, listDevUsers } = await import("@/lib/auth");
    expect(await getCurrentUser()).toBeNull();
    await expect(setDevUser(user.id)).rejects.toThrow();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(await listDevUsers()).toHaveLength(1);
  });

  it("sets a cookie only after checking the seed fixture", async () => {
    const { setDevUser } = await import("@/lib/auth");
    await setDevUser(seeded.id);
    expect(mocks.cookieSet).toHaveBeenCalledWith("hf_session", seeded.id, expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
  });
  it("can clear a stale local cookie without looking up or changing any records", async () => {
    mocks.cookieGet.mockReturnValue({ value: "deleted-user" });
    const { clearDevSession } = await import("@/lib/auth");
    await clearDevSession();
    expect(mocks.cookieSet).toHaveBeenCalledWith("hf_session", "", expect.objectContaining({ maxAge: 0, httpOnly: true, sameSite: "lax", path: "/" }));
    expect(mocks.userFind).not.toHaveBeenCalled();
  });
  it("never clears a dev cookie in Entra mode or for a remote host", async () => {
    vi.stubEnv("AUTH_MODE", "entra");
    const { clearDevSession } = await import("@/lib/auth");
    await expect(clearDevSession()).rejects.toThrow();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

describe("authorization runtime role validation", () => {
  it.each(["Admin", "root", "__proto__", "constructor", "", null])("denies invalid stored role %s", async (role) => {
    mocks.membershipFind.mockResolvedValue({ role });
    const { assertAccess, getUserRole, canEdit } = await import("@/lib/auth");
    await expect(assertAccess("user", "hack", "Viewer")).rejects.toThrow();
    expect(await getUserRole("user", "hack")).toBeNull();
    expect(canEdit(role as never)).toBe(false);
  });

  describe("desktop single-user identity", () => {
    it("uses the desktop owner only after capability validation and ignores development cookies", async () => {
      vi.stubEnv("AUTH_MODE", "desktop-local");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("AI_PROVIDER", "mock");
      vi.stubEnv("HF_DESKTOP_PACKAGE", "1");
      vi.stubEnv("HF_DESKTOP_SESSION_TOKEN", "a".repeat(64));
      vi.stubEnv("APP_URL", "http://127.0.0.1:3199");
      mocks.requestHeaders = new Headers({ host: "127.0.0.1:3199", "x-hf-desktop-token": "a".repeat(64) });
      mocks.cookieGet.mockReturnValue({ value: "untrusted-cookie" });
      const { getCurrentUser, setDevUser, clearDevSession, listDevUsers } = await import("@/lib/auth");
      expect(await getCurrentUser()).toMatchObject({ id: seeded.id });
      expect(mocks.cookieGet).not.toHaveBeenCalled();
      await expect(listDevUsers()).rejects.toThrow();
      await expect(setDevUser(seeded.id)).rejects.toThrow();
      await expect(clearDevSession()).rejects.toThrow();
      mocks.requestHeaders.delete("x-hf-desktop-token");
      mocks.userFind.mockClear();
      await expect(getCurrentUser()).rejects.toThrow("desktop application");
      expect(mocks.userFind).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["Viewer", "Viewer", true], ["Viewer", "Contributor", false], ["Contributor", "Owner", false],
    ["Contributor", "Contributor", true], ["Owner", "Owner", true],
  ] as const)("checks %s against %s", async (role, minimum, allowed) => {
    mocks.membershipFind.mockResolvedValue({ role });
    const { assertAccess } = await import("@/lib/auth");
    if (allowed) await expect(assertAccess("user", "hack", minimum)).resolves.toBe(role);
    else await expect(assertAccess("user", "hack", minimum)).rejects.toThrow();
  });

  it("denies malformed minimum roles and missing identifiers", async () => {
    const { assertAccess } = await import("@/lib/auth");
    await expect(assertAccess("user", "hack", "root" as never)).rejects.toThrow();
    await expect(assertAccess("user", undefined as never, "Viewer")).rejects.toThrow();
    expect(mocks.membershipFind).not.toHaveBeenCalled();
  });
});
