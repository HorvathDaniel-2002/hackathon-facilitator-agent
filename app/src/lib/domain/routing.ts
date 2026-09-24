import type { Routing } from "@/lib/methodology";
import type { CsFitBand, Platform } from "@/lib/schemas";

/**
 * Platform routing — the "Copilot Studio fit" logic, product spec §5.3.
 *
 * The model reports which *signals* it observed. Turning those signals into a
 * platform recommendation happens here, against the decision table in
 * methodology/routing.yaml, so routing is explainable, tunable without a code
 * change, and identical for identical inputs.
 */

export interface RoutingResult {
  platform: Platform;
  band: CsFitBand;
  copilotStudioSignals: string[];
  azureSignals: string[];
  unknownSignals: string[];
  matchedRule: string;
}

/**
 * Evaluates one condition from routing.yaml, e.g. `az == 0 && cs >= 3`.
 *
 * Deliberately a tiny hand-written parser rather than `eval` / `new Function`:
 * this string comes from a config file, and config files get edited by people
 * who are not thinking about code execution.
 */
function evaluateCondition(
  expr: string,
  vars: Record<string, number>,
): boolean {
  const trimmed = expr.trim();
  if (trimmed === "true") return true;

  return trimmed.split("&&").every((clause) => {
    const m = clause.trim().match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*(\d+)$/);
    if (!m) {
      throw new Error(`Unparseable routing rule condition: "${clause.trim()}"`);
    }
    const [, name, op, numStr] = m;
    const left = vars[name];
    if (left === undefined) {
      throw new Error(`Unknown variable "${name}" in routing rule: "${expr}"`);
    }
    const right = Number(numStr);

    switch (op) {
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case ">=":
        return left >= right;
      case "<=":
        return left <= right;
      case ">":
        return left > right;
      case "<":
        return left < right;
      default:
        return false;
    }
  });
}

export function resolvePlatform(
  firedSignals: string[],
  cfg: Routing,
): RoutingResult {
  const csIds = new Set(cfg.signals.copilotStudio.map((s) => s.id));
  const azIds = new Set(cfg.signals.azureAI.map((s) => s.id));

  const unique = Array.from(new Set(firedSignals));
  const copilotStudioSignals = unique.filter((s) => csIds.has(s));
  const azureSignals = unique.filter((s) => azIds.has(s));
  const unknownSignals = unique.filter((s) => !csIds.has(s) && !azIds.has(s));

  const vars = { cs: copilotStudioSignals.length, az: azureSignals.length };

  for (const rule of cfg.rules) {
    if (evaluateCondition(rule.if, vars)) {
      return {
        platform: rule.platform as Platform,
        band: rule.band as CsFitBand,
        copilotStudioSignals,
        azureSignals,
        unknownSignals,
        matchedRule: rule.if,
      };
    }
  }

  // routing.yaml ends with an `if: "true"` catch-all, so this is unreachable
  // unless someone deletes it.
  return {
    platform: "Hybrid",
    band: "Moderate",
    copilotStudioSignals,
    azureSignals,
    unknownSignals,
    matchedRule: "fallback",
  };
}

export function signalLabel(id: string, cfg: Routing): string {
  const all = [...cfg.signals.copilotStudio, ...cfg.signals.azureAI];
  return all.find((s) => s.id === id)?.label ?? id;
}
