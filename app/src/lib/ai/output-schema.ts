import { z } from "zod";
import type { AiEvaluation } from "@/lib/schemas";

/**
 * Azure supports a JSON Schema subset, not length/range/uniqueItems keywords.
 * Keyed required objects make gate/signal IDs complete and unique at the wire
 * boundary; bounded strings and confidence are additionally validated locally.
 * https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs
 */
export function createEvaluationSchema(gateIds: string[], signalIds: string[]) {
  if (!gateIds.length || !signalIds.length ||
      new Set(gateIds).size !== gateIds.length || new Set(signalIds).size !== signalIds.length) {
    throw new Error("Evaluation methodology must have unique gates and signals.");
  }
  const text = z.string().trim().min(1).max(2_000);
  const dimensions = <T extends z.ZodType>(item: T) => z.strictObject({
    value: item, feasibility: item, dataReadiness: item, reusability: item,
  });
  const wire = z.strictObject({
    scores: dimensions(z.literal([1, 2, 3, 4, 5])),
    scoreRationale: dimensions(text),
    routingSignals: z.strictObject(Object.fromEntries(signalIds.map((id) => [id, z.boolean()]))),
    judgementGates: z.strictObject(Object.fromEntries(gateIds.map((id) => [
      id, z.strictObject({ pass: z.boolean(), reason: text }),
    ]))),
    confidence: z.number().min(0).max(1),
    rationale: text,
  });
  const schema = wire.transform((value) => ({
    ...value,
    routingSignals: signalIds.filter((id) => value.routingSignals[id]),
    judgementGates: gateIds.map((gate) => ({ gate, ...value.judgementGates[gate] })),
  }));
  const unsupported = new Set(["$schema", "minLength", "maxLength", "minimum", "maximum"]);
  function compatible(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(compatible);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !unsupported.has(key)).map(([key, entry]) => [key, compatible(entry)]));
    }
    return value;
  }
  const jsonSchema = compatible(z.toJSONSchema(wire, { target: "draft-7" })) as Record<string, unknown>;
  return { schema, jsonSchema };
}

export function evaluationWireValue(data: AiEvaluation, signalIds: string[]) {
  return {
    ...data,
    routingSignals: Object.fromEntries(signalIds.map((id) => [id, data.routingSignals.includes(id)])),
    judgementGates: Object.fromEntries(data.judgementGates.map(({ gate, pass, reason }) => [gate, { pass, reason }])),
  };
}
