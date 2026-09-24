export function isWorkspaceFrozen(status: string) {
  return status === "Closed" || status === "Archived";
}

export function canEditRunbookItem(status: string, stage: string, gate: string) {
  return status !== "Archived" && (status !== "Closed" || (stage === "Follow-up" && gate === "None"));
}
