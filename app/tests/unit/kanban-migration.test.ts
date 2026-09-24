import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../scripts/migrate-kanban.mjs";
import { initialProgressStage } from "@/lib/kanban";

const databases: Database.Database[] = [];
function legacyDatabase() {
  const db = new Database(":memory:");
  databases.push(db);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE Hackathon (id TEXT PRIMARY KEY, name TEXT, customer TEXT, status TEXT,
      version INTEGER, createdAt INTEGER, updatedAt INTEGER, sponsorName TEXT,
      objective TEXT, format TEXT, startDate INTEGER, endDate INTEGER, location TEXT,
      decisionCriteria TEXT, productionIntent TEXT);
    INSERT INTO Hackathon VALUES ('event', 'Preserve workspace', 'Synthetic customer',
      'Planning', 4, 10, 20, 'Remove sponsor', 'Remove objective', '2day', 30, 40,
      'Remove location', 'Remove criteria', 'Remove intent');
    CREATE TABLE UseCase (id TEXT PRIMARY KEY, hackathonId TEXT REFERENCES Hackathon(id), status TEXT, description TEXT);
    CREATE TABLE Handoff (id TEXT PRIMARY KEY, useCaseId TEXT UNIQUE REFERENCES UseCase(id),
      portfolioDecision TEXT, businessOwner TEXT, nextMilestone TEXT, nextMilestoneDate TEXT);
    CREATE TABLE Milestone (id TEXT PRIMARY KEY, hackathonId TEXT REFERENCES Hackathon(id), title TEXT);
    INSERT INTO Milestone VALUES ('old-plan', 'event', 'Retired plan');
    CREATE TABLE Evaluation (id TEXT PRIMARY KEY, useCaseId TEXT REFERENCES UseCase(id), evidence TEXT);
  `);
  return db;
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe("Kanban migration", () => {
  it("deletes only charter/milestone data and preserves use cases, handoffs and assessment history", () => {
    const db = legacyDatabase();
    db.exec(`
      INSERT INTO UseCase VALUES ('uc', 'event', 'Closed', 'Keep all original use-case notes');
      INSERT INTO Handoff VALUES ('handoff', 'uc', 'CustomerLed', 'Owner', 'Preserved next action', '2026-10-10');
      INSERT INTO Evaluation VALUES ('eval', 'uc', 'Keep original evaluation evidence');
    `);
    migrateDatabase(db);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'Milestone'").get()).toBeUndefined();
    expect(db.prepare<[], { name: string }>("PRAGMA table_info(Hackathon)").all().map(row => row.name)).toEqual([
      "id", "name", "customer", "status", "version", "createdAt", "updatedAt",
    ]);
    expect(db.prepare("SELECT * FROM Hackathon").get()).toMatchObject({ id: "event", version: 4, name: "Preserve workspace" });
    expect(db.prepare("SELECT * FROM UseCase").get()).toMatchObject({ status: "Closed", description: "Keep all original use-case notes" });
    expect(db.prepare("SELECT * FROM Evaluation").get()).toMatchObject({ evidence: "Keep original evaluation evidence" });
    expect(db.prepare("SELECT * FROM Handoff").get()).toMatchObject({
      businessOwner: "Owner", nextMilestone: "Preserved next action", nextMilestoneDate: "2026-10-10",
      progressStage: "Assessing", deliveryRoute: "Unassigned", cafStatus: "NotSubmitted",
      productionReference: null, cafReference: null,
    });
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it.each([
    ["Draft", null], ["Qualified", null], ["Selected", null], ["Building", null],
    ["Demoed", null], ["Closed", "CustomerLed"], ["Closed", "Stop"], ["Parked", null],
  ])("migrates %s / %s without inventing a rollout or submission", (status, decision) => {
    const db = legacyDatabase();
    db.prepare("INSERT INTO UseCase VALUES ('uc', 'event', ?, 'source')").run(status);
    db.prepare("INSERT INTO Handoff VALUES ('handoff', 'uc', ?, 'Owner', 'Next', '2026-10-10')").run(decision);
    migrateDatabase(db);
    expect(db.prepare("SELECT * FROM Handoff").get()).toMatchObject({
      progressStage: initialProgressStage(status, decision), deliveryRoute: "Unassigned", cafStatus: "NotSubmitted",
    });
  });

  it("refuses repeated migration without overwriting new workflow information", () => {
    const db = legacyDatabase();
    migrateDatabase(db);
    expect(() => migrateDatabase(db)).toThrow("already migrated or has an unsupported schema");
  });
});
