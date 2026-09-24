/**
 * Exercises evaluator and guide generation through actual UI clicks, against
 * an exclusively owned temporary SQLite database. Never calls the real model
 * or deletes evaluations belonging to a seeded/sample use case.
 */
import { runIsolatedBrowserTests } from "./smoke.mjs";

process.exitCode = runIsolatedBrowserTests("@ai");
