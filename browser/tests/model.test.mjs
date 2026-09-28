import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { newWorkspace, newCard, validateWorkspace, validateCard, backup, parseBackup, csv, validDate, LIMIT } from "../model.mjs";
import { build, FILES } from "../tools/build.mjs";

test("empty and fictional workspaces are valid without fabricated production/submission status", () => {
  assert.equal(newWorkspace("Workshop").cases.length, 0);
  const sample = newWorkspace("Demo", true);
  assert.equal(sample.cases.length, 3);
  assert.ok(sample.cases.every(c => c.stage !== "In production" && c.cafStatus === "Not submitted"));
  assert.ok(sample.checks.every(c => !c.done));
});
test("codes remain unique across deletion, mixed case and gaps", () => {
  const card = newCard([{ code: "uc-01" }, { code: "UC-03" }], "new");
  assert.equal(card.code, "UC-02");
});
test("production and CAF transitions require shared handoff owner and evidence", () => {
  const c = { ...newCard([], "id"), title: "Case", stage: "In production" };
  assert.throws(() => validateCard(c), /business owner/);
  c.businessOwner = "Alex";
  assert.throws(() => validateCard(c), /evidence/);
  c.productionReference = "Reviewed pilot 1";
  validateCard(c);
  c.cafStatus = "Submitted";
  assert.throws(() => validateCard(c), /CAF submission reference/);
  c.cafReference = "Example ticket";
  validateCard(c);
  c.businessOwner = " ";
  assert.throws(() => validateCard(c), /business owner/);
});
test("real calendar dates only, including leap days", () => {
  for (const date of ["", "2024-02-29", "2026-09-28"]) assert.equal(validDate(date), true);
  for (const date of ["2025-02-29", "2026-02-30", "2026-99-12", "0001-01-01", "2026-1-1", "not-date"]) assert.equal(validDate(date), false);
});
test("readiness completion needs owner, date and evidence", () => {
  const w = newWorkspace("Workshop");
  w.checks[0].done = true;
  assert.throws(() => validateWorkspace(w), /owner, evidence/);
  Object.assign(w.checks[0], { owner: "Reviewer", date: "2026-09-28", evidence: "Workshop notes" });
  validateWorkspace(w);
  w.checks[0].date = "2026-02-30";
  assert.throws(() => validateWorkspace(w), /valid calendar/);
});
test("strict backups round-trip all fields and reject foreign or partial formats", () => {
  const w = newWorkspace("Workshop", true);
  assert.deepEqual(parseBackup(backup(w)), w);
  for (const input of ["broken", "{}", "null", '[]', '{"format":"desktop","version":1,"workspace":{}}',
    backup(w).replace('"version": 1', '"version": 99')]) assert.throws(() => parseBackup(input));
  assert.throws(() => parseBackup(" ".repeat(LIMIT + 1)), /2 MB/);
});
test("IDs/codes, enums, types, unknown fields and record limits are validated", () => {
  const w = newWorkspace("Demo", true);
  for (const mutate of [
    x => x.cases.push(x.cases[0]),
    x => x.cases[1].code = "uc-01",
    x => x.cases[0].stage = "Invented",
    x => x.cases[0].title = "",
    x => x.cases[0].title = 123,
    x => x.cases[0].unexpected = "field",
    x => x.checks.pop(),
    x => x.checks[0].done = "true",
    x => x.name = " ",
    x => x.cases = Array.from({ length: 251 }, (_, i) => ({ ...x.cases[0], id: `id-${i}`, code: `UC-${i}` })),
  ]) { const next = structuredClone(w); mutate(next); assert.throws(() => validateWorkspace(next)); }
});
test("CSV quotes multiline cells and neutralizes spreadsheet formulas", () => {
  const w = newWorkspace("Demo", true);
  w.cases[0].title = '  =SUM(1,2)\n"quoted"';
  const out = csv(w);
  assert.ok(out.startsWith("\uFEFF"));
  assert.ok(out.includes(`"'  =SUM(1,2)\n""quoted"""`));
});
test("exports preserve HTML-like text as data without evaluating it", () => {
  const w = newWorkspace("Demo", true);
  w.cases[0].title = '<img src=x onerror=alert(1)>';
  assert.equal(parseBackup(backup(w)).cases[0].title, w.cases[0].title);
});
test("deploy artifact is a strict static allowlist and refuses reuse", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hf-pages-test-"));
  try {
    const output = path.join(temp, "site");
    assert.equal(build(output).length, FILES.length);
    assert.deepEqual(fs.readdirSync(output).sort(), [...FILES, ".nojekyll"].sort());
    assert.throws(() => build(output), /new site output/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
