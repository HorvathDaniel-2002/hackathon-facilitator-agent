import { describe, expect, it } from "vitest";
import {
  clampScore,
  computeWeightedScore,
  resolveBand,
} from "@/lib/domain/scoring";
import { getMethodology } from "@/lib/methodology";

const { rubric } = getMethodology();

describe("computeWeightedScore", () => {
  it("applies the published 40/30/20/10 weighting", () => {
    // 4*0.4 + 3*0.3 + 4*0.2 + 3*0.1 = 1.6 + 0.9 + 0.8 + 0.3 = 3.6
    expect(
      computeWeightedScore(
        { value: 4, feasibility: 3, dataReadiness: 4, reusability: 3 },
        rubric,
      ),
    ).toBe(3.6);
  });

  it("returns the scale bounds for all-min and all-max input", () => {
    expect(
      computeWeightedScore(
        { value: 1, feasibility: 1, dataReadiness: 1, reusability: 1 },
        rubric,
      ),
    ).toBe(1);
    expect(
      computeWeightedScore(
        { value: 5, feasibility: 5, dataReadiness: 5, reusability: 5 },
        rubric,
      ),
    ).toBe(5);
  });

  it("rounds to one decimal, matching how the bands are expressed", () => {
    const score = computeWeightedScore(
      { value: 5, feasibility: 4, dataReadiness: 2, reusability: 1 },
      rubric,
    );
    // 2.0 + 1.2 + 0.4 + 0.1 = 3.7
    expect(score).toBe(3.7);
    expect(Number.isInteger(score * 10)).toBe(true);
  });

  it("weights business value above every other dimension", () => {
    const valueHeavy = computeWeightedScore(
      { value: 5, feasibility: 1, dataReadiness: 1, reusability: 1 },
      rubric,
    );
    const reuseHeavy = computeWeightedScore(
      { value: 1, feasibility: 1, dataReadiness: 1, reusability: 5 },
      rubric,
    );
    expect(valueHeavy).toBeGreaterThan(reuseHeavy);
  });
});

describe("resolveBand", () => {
  it("maps scores onto the documented bands", () => {
    expect(resolveBand(4.0, rubric)).toBe("High");
    expect(resolveBand(4.7, rubric)).toBe("High");
    expect(resolveBand(3.9, rubric)).toBe("Medium");
    expect(resolveBand(3.0, rubric)).toBe("Medium");
    expect(resolveBand(2.9, rubric)).toBe("Low");
    expect(resolveBand(1.0, rubric)).toBe("Low");
  });

  it("treats band minimums as inclusive", () => {
    // The spec says ">= 4.0 = High", so exactly 4.0 must not fall to Medium.
    expect(resolveBand(4.0, rubric)).toBe("High");
    expect(resolveBand(3.0, rubric)).toBe("Medium");
  });
});

describe("clampScore", () => {
  it("keeps values inside the 1-5 rubric scale", () => {
    expect(clampScore(0, rubric)).toBe(1);
    expect(clampScore(9, rubric)).toBe(5);
    expect(clampScore(3.4, rubric)).toBe(3);
    expect(clampScore(3.6, rubric)).toBe(4);
  });

  it("degrades to the scale minimum rather than propagating NaN", () => {
    expect(clampScore(Number.NaN, rubric)).toBe(1);
  });
});

describe("rubric config", () => {
  it("has weights that sum to exactly 1", () => {
    const { value, feasibility, dataReadiness, reusability } = rubric.weights;
    expect(value + feasibility + dataReadiness + reusability).toBeCloseTo(1, 10);
  });
});
