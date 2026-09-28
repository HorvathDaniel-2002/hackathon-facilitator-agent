export const STAGES = ["Intake", "Assessing", "Building", "Pilot", "In production", "Parked"];
export const ROUTES = ["Unassigned", "Copilot / Cowork", "Copilot Studio", "Custom build", "CAF"];
export const CAF = ["Not submitted", "Preparing", "Submitted"];
export const CHECKS = [
  ["purpose", "Purpose and measurable success", "Define the problem, intended users and how success will be measured."],
  ["data", "Data access and permission", "Confirm approved data, access permissions and privacy requirements."],
  ["review", "Human review and safety", "Name the reviewer and document limitations, risks and escalation."],
  ["demo", "Demo and evidence", "Record what was actually demonstrated, not only what was planned."],
  ["handoff", "Owner and follow-up", "Agree an accountable owner, next action and a follow-up date."],
  ["rollout", "Rollout decision", "Record the decision and outstanding gates before any real deployment."],
];
export const FORMAT = "hackathon-facilitator-browser";
export const LIMIT = 2_000_000;
export const TEXT_LIMITS = {
  code: 30, title: 160, problem: 4000, outcome: 2000, businessOwner: 160,
  technicalOwner: 160, deliveryOwner: 160, productionReference: 1000, cafReference: 1000,
  nextAction: 2000, nextDate: 10, whatWasBuilt: 4000, results: 4000, gaps: 4000,
};

function object(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key)) ||
      keys.some(key => !Object.hasOwn(value, key))) throw new Error(`Invalid ${label} fields. No saved data was changed.`);
}
function text(value, max, label, required = false) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ||
      (required && !value.trim())) throw new Error(`${label} ${required ? "is required and " : ""}must be text of at most ${max} characters.`);
}
function oneOf(value, values, label) {
  if (!values.includes(value)) throw new Error(`Select a valid ${label}.`);
}
export function validDate(value) {
  if (value === "") return true;
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900 &&
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateCard(card) {
  object(card, ["id", ...Object.keys(TEXT_LIMITS), "stage", "route", "cafStatus"], "use case");
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(card.id)) throw new Error("Invalid use-case identifier.");
  for (const [key, max] of Object.entries(TEXT_LIMITS)) text(card[key], max, key, ["title", "code"].includes(key));
  oneOf(card.stage, STAGES, "progress stage");
  oneOf(card.route, ROUTES, "delivery route");
  oneOf(card.cafStatus, CAF, "CAF status");
  if (!validDate(card.nextDate)) throw new Error("Next action date must be a valid calendar date.");
  if (card.stage === "In production" && (!card.businessOwner.trim() || !card.productionReference.trim())) {
    throw new Error("In production requires a business owner and a production evidence/reference.");
  }
  if (card.cafStatus === "Submitted" && (!card.businessOwner.trim() || !card.cafReference.trim())) {
    throw new Error("Submitted to CAF requires a business owner and a CAF submission reference.");
  }
  return card;
}
export function validateWorkspace(workspace) {
  object(workspace, ["name", "cases", "checks"], "workspace");
  text(workspace.name, 120, "Workspace name", true);
  if (!Array.isArray(workspace.cases) || workspace.cases.length > 250) throw new Error("A browser workspace supports up to 250 use cases.");
  const ids = new Set(), codes = new Set();
  for (const card of workspace.cases) {
    validateCard(card);
    if (ids.has(card.id) || codes.has(card.code.trim().toLowerCase())) throw new Error("Use-case identifiers and codes must be unique.");
    ids.add(card.id); codes.add(card.code.trim().toLowerCase());
  }
  if (!Array.isArray(workspace.checks) || workspace.checks.length !== CHECKS.length) throw new Error("Invalid readiness checklist.");
  workspace.checks.forEach((check, i) => {
    object(check, ["id", "done", "owner", "evidence", "date"], "readiness check");
    if (check.id !== CHECKS[i][0] || typeof check.done !== "boolean") throw new Error("Invalid readiness check.");
    text(check.owner, 160, "Check owner"); text(check.evidence, 2000, "Check evidence"); text(check.date, 10, "Check date");
    if (!validDate(check.date)) throw new Error("Readiness date must be a valid calendar date.");
    if (check.done && (!check.owner.trim() || !check.evidence.trim() || !check.date)) {
      throw new Error("A completed readiness check needs an owner, evidence/reference and a review date.");
    }
  });
  if (new TextEncoder().encode(JSON.stringify({ format: FORMAT, version: 1, workspace }, null, 2)).length > LIMIT) {
    throw new Error("Workspace is too large. Keep the backup below 2 MB.");
  }
  return workspace;
}
export function newCard(cases = [], id = crypto.randomUUID()) {
  let n = 1;
  const codes = new Set(cases.map(card => card.code.trim().toLowerCase()));
  while (codes.has(`uc-${String(n).padStart(2, "0")}`)) n++;
  return { id, ...Object.fromEntries(Object.keys(TEXT_LIMITS).map(key => [key, ""])),
    code: `UC-${String(n).padStart(2, "0")}`, stage: "Intake", route: "Unassigned", cafStatus: "Not submitted" };
}
export function newWorkspace(name, sample = false) {
  const cases = sample ? [
    { title: "Find answers in approved team knowledge", problem: "Help workshop participants find current guidance without searching many documents.", outcome: "Measure answer usefulness on a reviewed sample.", stage: "Assessing", route: "Copilot / Cowork", businessOwner: "Alex (fictional)", nextAction: "Agree the approved document set and review questions." },
    { title: "Workshop support assistant", problem: "Answer common workshop questions and route unresolved requests to a person.", stage: "Building", route: "Copilot Studio", businessOwner: "Taylor (fictional)", nextAction: "Demonstrate the handoff to a human reviewer." },
    { title: "Draft a weekly operations summary", problem: "Prepare a draft from synthetic operational notes for review.", stage: "Pilot", route: "Custom build", businessOwner: "Sam (fictional)", nextAction: "Review the synthetic pilot outputs.", gaps: "No real customer data or production approval." },
  ].map((values, i) => ({ ...newCard([], `sample-${i + 1}`), code: `UC-0${i + 1}`, ...values })) : [];
  return validateWorkspace({ name, cases, checks: CHECKS.map(([id]) => ({ id, done: false, owner: "", evidence: "", date: "" })) });
}
export function backup(workspace) {
  validateWorkspace(workspace);
  return JSON.stringify({ format: FORMAT, version: 1, workspace }, null, 2);
}
export function parseBackup(source) {
  if (new TextEncoder().encode(source).length > LIMIT) throw new Error("Backup exceeds the 2 MB import limit.");
  let parsed;
  try { parsed = JSON.parse(source); } catch { throw new Error("This is not a valid JSON backup. Your current workspace is unchanged."); }
  object(parsed, ["format", "version", "workspace"], "backup");
  if (parsed.format !== FORMAT || parsed.version !== 1) throw new Error("Use a Browser Edition v1 backup. Desktop databases and other formats are not supported.");
  return validateWorkspace(parsed.workspace);
}
export function csv(workspace) {
  const columns = ["code", "title", "stage", "route", "businessOwner", "technicalOwner", "deliveryOwner",
    "nextAction", "nextDate", "cafStatus", "cafReference", "productionReference", "problem", "outcome", "whatWasBuilt", "results", "gaps"];
  const cell = value => `"${(/^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  return "\uFEFF" + [columns, ...workspace.cases.map(card => columns.map(key => card[key]))]
    .map(row => row.map(cell).join(",")).join("\r\n");
}
