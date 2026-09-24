import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "user" })),
  list: vi.fn(async () => [
    { id: "archived", status: "Archived" }, { id: "active", status: "Planning" },
  ]),
}));
vi.mock("@/lib/auth", () => ({ requireUser: state.requireUser }));
vi.mock("@/lib/queries", () => ({ listHackathons: state.list }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error("not-found"); },
}));
import BoardHome from "@/app/(app)/board/page";
import Home from "@/app/page";

beforeEach(() => vi.clearAllMocks());
describe("Kanban-first navigation", () => {
  it("opens the board selector at the application root", () => {
    expect(() => Home()).toThrow("redirect:/board");
  });
  it("chooses the first non-archived permitted workspace", async () => {
    await expect(BoardHome({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/hackathons/active/usecases");
    expect(state.list).toHaveBeenCalledWith("user");
  });
  it("respects an explicitly chosen permitted workspace", async () => {
    await expect(BoardHome({ searchParams: Promise.resolve({ hackathon: "archived" }) }))
      .rejects.toThrow("redirect:/hackathons/archived/usecases");
  });
  it.each(["foreign", ["active", "archived"]])("rejects an invalid workspace selection: %j", async hackathon => {
    await expect(BoardHome({ searchParams: Promise.resolve({ hackathon }) })).rejects.toThrow("not-found");
  });
  it("routes new users to workspace selection/creation without inventing a workspace", async () => {
    state.list.mockResolvedValueOnce([]);
    await expect(BoardHome({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/hackathons");
  });
});
