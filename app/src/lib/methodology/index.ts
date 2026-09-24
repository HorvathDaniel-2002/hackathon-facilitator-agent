import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * Loads /methodology/*.yaml once, validates it, and freezes it.
 *
 * Architectural rule 3: the methodology is versioned config, not code. Every
 * generated artifact is stamped with `methodologyVersion` so a result produced
 * six months ago can still be explained against the rubric that produced it.
 *
 * A malformed rubric fails the process at boot rather than silently producing
 * wrong scores.
 */

const rubricSchema = z
  .object({
    version: z.string(),
    scale: z.object({ min: z.number(), max: z.number() }),
    weights: z.object({
      value: z.number(),
      feasibility: z.number(),
      dataReadiness: z.number(),
      reusability: z.number(),
    }),
    dimensions: z.array(
      z.object({ id: z.string(), label: z.string(), assess: z.string() }),
    ),
    bands: z.array(z.object({ id: z.string(), min: z.number() })),
  })
  .refine(
    (r) => {
      const sum =
        r.weights.value +
        r.weights.feasibility +
        r.weights.dataReadiness +
        r.weights.reusability;
      // Tolerate float representation error, not actual mistakes.
      return Math.abs(sum - 1) < 1e-9;
    },
    { message: "rubric.yaml weights must sum to exactly 1.0" },
  );

const gatesSchema = z.object({
  version: z.string(),
  gates: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["deterministic", "judgement"]),
      label: z.string(),
      failReason: z.string(),
      remedy: z.string(),
    }),
  ),
});

const routingSchema = z.object({
  version: z.string(),
  signals: z.object({
    copilotStudio: z.array(z.object({ id: z.string(), label: z.string() })),
    azureAI: z.array(z.object({ id: z.string(), label: z.string() })),
  }),
  rules: z.array(
    z.object({ if: z.string(), platform: z.string(), band: z.string() }),
  ),
  hybridRule: z.string(),
});

const agendasSchema = z.object({
  version: z.string(),
  prep: z.array(
    z.object({
      title: z.string(),
      offsetDays: z.number(),
      description: z.string(),
    }),
  ),
  formats: z.record(
    z.string(),
    z.object({
      label: z.string(),
      days: z.array(z.object({ day: z.number(), items: z.array(z.string()) })),
    }),
  ),
  post: z.array(
    z.object({
      title: z.string(),
      offsetDays: z.number(),
      description: z.string(),
    }),
  ),
  buildRhythmRules: z.array(z.string()),
});

const handoffSchema = z.object({
  version: z.string(),
  portfolioDecisions: z.array(
    z.object({ id: z.string(), label: z.string(), description: z.string() }),
  ),
  routes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      useWhen: z.string(),
      match: z.object({
        decision: z.string(),
        platformIn: z.array(z.string()).optional(),
        failedGateIn: z.array(z.string()).optional(),
        minPriorityBand: z.string().optional(),
      }),
    }),
  ),
  exitPackageFields: z.array(z.string()),
  closureRequirements: z.array(z.string()),
});

export type Rubric = z.infer<typeof rubricSchema>;
export type Gates = z.infer<typeof gatesSchema>;
export type Routing = z.infer<typeof routingSchema>;
export type Agendas = z.infer<typeof agendasSchema>;
export type Handoff = z.infer<typeof handoffSchema>;

export interface Methodology {
  rubric: Rubric;
  gates: Gates;
  routing: Routing;
  agendas: Agendas;
  handoff: Handoff;
  /** Composite stamp written onto every generated artifact. */
  version: string;
}

function readYaml<T>(file: string, schema: z.ZodType<T>): T {
  const full = path.join(process.cwd(), "methodology", file);
  let raw: string;
  try {
    raw = fs.readFileSync(full, "utf8");
  } catch {
    throw new Error(`Methodology config missing: ${full}`);
  }
  const parsed = schema.safeParse(parseYaml(raw));
  if (!parsed.success) {
    throw new Error(
      `Invalid methodology/${file}:\n${JSON.stringify(parsed.error.format(), null, 2)}`,
    );
  }
  return parsed.data;
}

let cached: Methodology | null = null;

export function getMethodology(): Methodology {
  if (cached) return cached;

  const rubric = readYaml("rubric.yaml", rubricSchema);
  const gates = readYaml("gates.yaml", gatesSchema);
  const routing = readYaml("routing.yaml", routingSchema);
  const agendas = readYaml("agendas.yaml", agendasSchema);
  const handoff = readYaml("handoff.yaml", handoffSchema);

  cached = Object.freeze({
    rubric,
    gates,
    routing,
    agendas,
    handoff,
    version: `rubric@${rubric.version}+gates@${gates.version}+routing@${routing.version}+handoff@${handoff.version}`,
  });
  return cached;
}
