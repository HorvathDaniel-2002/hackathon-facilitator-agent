import { z } from "zod";
import { evaluationOverrideInputSchema } from "@/lib/schemas";
import { AiError } from "./errors";

export const aiEntityIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const guideRequestSchema = z.strictObject({
  hackathonId: aiEntityIdSchema,
  useCaseId: aiEntityIdSchema,
});
export const aiOverrideSchema = evaluationOverrideInputSchema.extend({
  rationale: z.string().trim().min(1).max(4_000).optional(),
  reason: z.string().trim().max(2_000).optional(),
}).strict().refine((value) => Object.entries(value).some(([key, item]) =>
  key !== "reason" && item !== undefined), {
  path: ["reason"], message: "Specify at least one score, routing field or rationale to override.",
});

export function assertAiRequestOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") ?? requestUrl.host;
  // Next may build Request.url from its internal listener hostname. Host is the
  // browser's authority; forwarded hosts are deliberately not trusted here.
  const expectedUrl = new URL(process.env.APP_URL || `${requestUrl.protocol}//${host}`);
  if (!["http:", "https:"].includes(expectedUrl.protocol) ||
      expectedUrl.username || expectedUrl.password ||
      (!process.env.APP_URL && expectedUrl.host.toLowerCase() !== host.toLowerCase())) {
    throw new AiError("The request origin configuration is invalid.", 403);
  }
  const expected = expectedUrl.origin;
  if (!origin || origin === "null" || origin !== expected ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AiError("Cross-origin requests are not allowed.", 403);
  }
}
