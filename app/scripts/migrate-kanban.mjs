import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const retiredColumns = ["sponsorName", "objective", "format", "startDate", "endDate", "location", "decisionCriteria", "productionIntent"];
const workflowColumns = [
  ["progressStage", "TEXT NOT NULL DEFAULT 'Intake'"],
  ["deliveryRoute", "TEXT NOT NULL DEFAULT 'Unassigned'"],
  ["cafStatus", "TEXT NOT NULL DEFAULT 'NotSubmitted'"],
  ["cafReference", "TEXT"],
  ["cafSubmittedOn", "DATETIME"],
  ["productionReference", "TEXT"],
  ["workflowUpdatedBy", "TEXT"],
  ["workflowUpdatedAt", "DATETIME"],
];
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const columns = (db, table) => db.prepare(`PRAGMA table_info(${quote(table)})`).all().map(row => row.name);
const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);

function rejectLinks(filename) {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const part of path.relative(current, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) break;
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Refusing a symlink/junction: ${current}`);
  }
}

function capture(db, includeRetired = false) {
  return tables(db).filter(table => includeRetired || table !== "Milestone").map(table => {
    const selected = columns(db, table).filter(column =>
      includeRetired || table !== "Hackathon" || !retiredColumns.includes(column));
    const rows = db.prepare(`SELECT ${selected.map(quote).join(", ")} FROM ${quote(table)} ORDER BY ${selected.map(quote).join(", ")}`).all();
    return { table, columns: selected, count: rows.length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
  });
}

function verifyPreserved(db, snapshot) {
  for (const original of snapshot) {
    const rows = db.prepare(`SELECT ${original.columns.map(quote).join(", ")} FROM ${quote(original.table)} ORDER BY ${original.columns.map(quote).join(", ")}`).all();
    if (rows.length !== original.count || createHash("sha256").update(JSON.stringify(rows)).digest("hex") !== original.hash) {
      throw new Error(`Migration changed preserved data in ${original.table}.`);
    }
  }
  if (tables(db).includes("Milestone") || columns(db, "Hackathon").some(column => retiredColumns.includes(column))) {
    throw new Error("Retired event data is still in the active schema.");
  }
  if (db.pragma("foreign_key_check").length || db.pragma("integrity_check", { simple: true }) !== "ok") {
    throw new Error("Database integrity check failed.");
  }
  if (db.prepare(`SELECT COUNT(*) AS count FROM Handoff WHERE deliveryRoute != 'Unassigned' OR cafStatus != 'NotSubmitted'
    OR progressStage IN ('Pilot', 'InProduction') OR cafReference IS NOT NULL OR productionReference IS NOT NULL`).get().count) {
    throw new Error("Migration must not infer delivery, submission or deployment.");
  }
}

export function migrateDatabase(db) {
  if (!tables(db).includes("Milestone") || !retiredColumns.every(column => columns(db, "Hackathon").includes(column))) {
    throw new Error("Expected the reviewed pre-Kanban schema; database is already migrated or has an unsupported schema.");
  }
  if (workflowColumns.some(([column]) => columns(db, "Handoff").includes(column))) {
    throw new Error("Partially migrated handoff schema; do not continue automatically.");
  }
  if (db.pragma("foreign_key_check").length) throw new Error("Existing foreign-key errors must be resolved before migration.");
  const preserved = capture(db);
  db.pragma("foreign_keys = ON");
  db.pragma("secure_delete = ON");
  db.transaction(() => {
    db.exec('DROP TABLE "Milestone"');
    for (const column of retiredColumns) db.exec(`ALTER TABLE "Hackathon" DROP COLUMN ${quote(column)}`);
    for (const [column, type] of workflowColumns) db.exec(`ALTER TABLE "Handoff" ADD COLUMN ${quote(column)} ${type}`);
    db.exec(`UPDATE Handoff SET progressStage = CASE
      WHEN portfolioDecision = 'Stop' OR (SELECT status FROM UseCase WHERE id = Handoff.useCaseId) = 'Parked' THEN 'Parked'
      WHEN (SELECT status FROM UseCase WHERE id = Handoff.useCaseId) IN ('Building', 'Demoed') THEN 'Building'
      WHEN (SELECT status FROM UseCase WHERE id = Handoff.useCaseId) IN ('Qualified', 'Selected', 'Closed') THEN 'Assessing'
      ELSE 'Intake' END`);
    verifyPreserved(db, preserved);
  }).immediate();
  return { preserved: preserved.map(({ table, count }) => ({ table, count })), removed: { table: "Milestone", columns: retiredColumns } };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args[0] === "--apply";
  if (!apply && args[0] !== "--preview") throw new Error("Use --preview or --apply --database <existing.db> --backup <new.db> --trial <new.db>. Stop the app before --apply.");
  if (args.length !== 7 || args[1] !== "--database" || args[3] !== "--backup" || args[5] !== "--trial") {
    throw new Error("Exactly one database, new backup and new trial path are required.");
  }
  const [database, backup, trial] = [args[2], args[4], args[6]].map(value => path.resolve(value));
  if (new Set([database, backup, trial].map(value => value.toLowerCase())).size !== 3) throw new Error("Database, backup and trial must be distinct.");
  for (const filename of [database, backup, trial]) {
    rejectLinks(filename);
    if (path.extname(filename).toLowerCase() !== ".db") throw new Error("Use explicit .db file paths.");
  }
  if (!fs.existsSync(database) || !fs.statSync(database).isFile()) throw new Error("Existing database not found.");
  if (fs.existsSync(backup) || fs.existsSync(trial)) throw new Error("Backup/trial already exists. Never overwrite a recovery copy.");
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.mkdirSync(path.dirname(trial), { recursive: true });
  const live = new Database(database, { fileMustExist: true, readonly: !apply });
  let dryRun;
  try {
    const before = capture(live, true);
    await live.backup(backup);
    fs.copyFileSync(backup, trial, fs.constants.COPYFILE_EXCL);
    dryRun = new Database(trial, { fileMustExist: true });
    const result = migrateDatabase(dryRun);
    dryRun.close();
    dryRun = null;
    if (JSON.stringify(capture(live, true)) !== JSON.stringify(before)) {
      throw new Error("The source changed while previewing. Stop writers and retry with new backup paths.");
    }
    if (apply) migrateDatabase(live);
    console.log(JSON.stringify({ applied: apply, database, backup, trial, ...result }, null, 2));
  } finally {
    if (dryRun?.open) dryRun.close();
    live.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
