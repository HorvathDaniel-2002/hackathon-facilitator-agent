export function reportAiPersistenceFailure(
  stage: "evaluation-accounting" | "guide-checkpoint" | "guide-finalization" | "guide-failure" | "guide-accounting",
  jobId: string,
): void {
  // Intentionally omit exception objects: provider/Prisma errors can embed inputs.
  console.error("AI persistence failure", {
    stage,
    jobId: /^[A-Za-z0-9_-]{1,128}$/.test(jobId) ? jobId : "invalid-job-id",
  });
}
