/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { GUARD_MARKER } from "@/lib/actions/guard";

/**
 * Plan R-8: authorization coverage must be *provable*, not a matter of reviewer
 * vigilance.
 *
 * Every exported server action is wrapped by withAccess/withUser, which stamps a
 * marker on the function. This test enumerates the action modules and fails if
 * any export is missing that stamp — so a new action cannot ship without an
 * authorization check just because nobody noticed in review.
 */

const MODULES = Object.entries(
  import.meta.glob("/src/lib/actions/*.ts", { eager: true }) as Record<string, Record<string, unknown>>,
).filter(([file]) => !file.endsWith("/guard.ts"))
  .map(([file, exports]) => [file.split("/").at(-1)!.replace(/\.ts$/, ""), exports] as const);

describe("server action authorization coverage", () => {
  it.each(MODULES)("every exported action in %s is guarded", (name, mod) => {
    const unguarded: string[] = [];

    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value !== "function") continue;
      const guarded =
        (value as unknown as Record<symbol, unknown>)[GUARD_MARKER] === true;
      if (!guarded) unguarded.push(exportName);
    }

    expect(
      unguarded,
      `Unguarded action(s) in lib/actions/${name}.ts: ${unguarded.join(", ")}. ` +
        `Wrap them with withAccess() or withUser().`,
    ).toEqual([]);
  });

  it("actually exports actions, so the check cannot pass vacuously", () => {
    expect(MODULES.some(([name]) => name === "runbook")).toBe(true);
    for (const [name, mod] of MODULES) {
      const fns = Object.values(mod).filter((v) => typeof v === "function");
      expect(fns.length, `lib/actions/${name}.ts exports no actions`).toBeGreaterThan(
        0,
      );
    }
  });
});
