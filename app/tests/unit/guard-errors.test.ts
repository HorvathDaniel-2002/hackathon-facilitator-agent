import { describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/auth";
import { ConcurrencyConflictError } from "@/lib/db";
import { toActionError, validationFailure } from "@/lib/actions/guard";

describe("guard error responses", () => {
  it.each(["P2002", "P2025"])("returns a safe conflict for database code %s", (code) => {
    const error = Object.assign(new Error("Query includes customer input and internal filesystem paths"), { code });
    expect(toActionError(error)).toMatchObject({ ok: false, code: "conflict" });
    expect(toActionError(error).error).not.toContain("customer input");
  });

  it.each(["P2003", "P1008", "P2028"])("redacts database details for %s", (code) => {
    const error = Object.assign(new Error("Secret request payload"), { code });
    expect(toActionError(error)).toEqual({
      ok: false, code: "error", error: "The database operation could not be completed. Please try again.",
    });
  });

  it("redacts Prisma validation errors without a code", () => {
    const error = new Error("Internal schema and request values");
    error.name = "PrismaClientValidationError";
    expect(toActionError(error).error).not.toContain("request values");
  });

  it("preserves intentional authorization, concurrency and validation messages", () => {
    expect(toActionError(new AccessDeniedError())).toMatchObject({ code: "denied" });
    expect(toActionError(new ConcurrencyConflictError("Case"))).toMatchObject({ code: "conflict" });
    try {
      validationFailure({ title: ["A title is required."] });
    } catch (error) {
      expect(toActionError(error)).toMatchObject({ code: "validation", fieldErrors: { title: ["A title is required."] } });
    }
    expect(toActionError(new Error("Complete the handoff first."))).toMatchObject({ error: "Complete the handoff first." });
  });
});
