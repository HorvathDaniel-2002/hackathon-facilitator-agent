import { describe, expect, it } from "vitest";
import {
  contactInputSchema, hackathonInputSchema, handoffInputSchema, inviteMemberInputSchema,
  teamMemberInputSchema, useCaseInputSchema, versionSchema,
  useCaseUpdateInputSchema, hackathonUpdateInputSchema, contactUpdateInputSchema,
  scoreSchema, evaluationOverrideInputSchema,
} from "@/lib/schemas";

describe("runtime action input contracts", () => {
  it.each([0, 1.1, 3.96, 4.5, 6, NaN, Infinity, "4"])("rejects non-integer or out-of-range rubric scores %s", (score) => {
    expect(scoreSchema.safeParse(score).success).toBe(false);
    expect(evaluationOverrideInputSchema.safeParse({ valueScore: score }).success).toBe(false);
  });

  it.each([1, 2, 3, 4, 5])("accepts the integer rubric step %s", (score) => {
    expect(scoreSchema.safeParse(score).success).toBe(true);
  });

  it.each([
    () => inviteMemberInputSchema.safeParse({ email: "user@example.com", role: "Admin" }),
    () => teamMemberInputSchema.safeParse({ useCaseId: "uc", contactId: "contact", party: "Root" }),
    () => useCaseInputSchema.safeParse({ title: "Valid title", status: "Anything" }),
    () => contactInputSchema.safeParse({ name: "Person", roleType: "Root" }),
    () => handoffInputSchema.safeParse({ portfolioDecision: "Whatever" }),
    () => hackathonInputSchema.safeParse({ name: "Event", customer: "Company", status: "INVALID" }),
  ])("rejects arbitrary enum values at runtime", (parse) => {
    expect(parse().success).toBe(false);
  });

  it.each(["2026-02-30", "tomorrow", "2026-13-01", "2026-01-01T00:00:00Z"])("rejects invalid date-only input %s", (dueDate) => {
    expect(handoffInputSchema.safeParse({ nextMilestoneDate: dueDate }).success).toBe(false);
  });

  it("accepts valid leap dates and explicit clearing", () => {
    expect(handoffInputSchema.safeParse({ nextMilestoneDate: "2028-02-29", cafSubmittedOn: "" }).success).toBe(true);
  });

  it.each(["sponsorName", "objective", "format", "startDate", "endDate", "location", "decisionCriteria", "productionIntent"])("rejects retired workspace field %s", (field) => {
    expect(hackathonInputSchema.safeParse({ name: "Workspace", customer: "Customer", [field]: "Retired" }).success).toBe(false);
    expect(hackathonUpdateInputSchema.safeParse({ [field]: "Retired" }).success).toBe(false);
  });

  it.each([undefined, -1, 0.5, NaN, Infinity, "0", Number.MAX_SAFE_INTEGER + 1])("rejects invalid concurrency token %s", (version) => {
    expect(versionSchema.safeParse(version).success).toBe(false);
  });

  it("does not silently accept whitespace titles, unknown fields or coerced readiness", () => {
    expect(useCaseInputSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(useCaseInputSchema.safeParse({ title: "A title", tenantId: "other" }).success).toBe(false);
    expect(useCaseInputSchema.safeParse({ title: "A title", sampleDataApproved: "true" }).success).toBe(false);
    expect(useCaseUpdateInputSchema.parse({ title: "A title" })).toEqual({ title: "A title" });
    expect(hackathonUpdateInputSchema.parse({ name: "Event" })).toEqual({ name: "Event" });
    expect(contactUpdateInputSchema.parse({ name: "Person" })).toEqual({ name: "Person" });
  });

  it("normalizes invitations and validates addresses fully", () => {
    expect(inviteMemberInputSchema.parse({ email: "  Person@Example.com ", role: "Viewer" }).email).toBe("person@example.com");
    expect(inviteMemberInputSchema.safeParse({ email: "x@y", role: "Viewer" }).success).toBe(false);
  });

  it("accepts empty optional select fields as explicit clearing, but rejects unknown choices", () => {
    expect(useCaseInputSchema.safeParse({ title: "Untiered case", manualImpact: "" }).success).toBe(true);
    expect(useCaseUpdateInputSchema.parse({ manualImpact: "" })).toEqual({ manualImpact: "" });
    expect(handoffInputSchema.parse({ portfolioDecision: "" })).toEqual({ portfolioDecision: "" });
    expect(useCaseInputSchema.safeParse({ title: "Invalid tier", manualImpact: "Urgent" }).success).toBe(false);
    expect(handoffInputSchema.safeParse({ portfolioDecision: "Anything" }).success).toBe(false);
  });
});
