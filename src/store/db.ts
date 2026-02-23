import Database from "better-sqlite3";

export type { Database } from "better-sqlite3";

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id         TEXT PRIMARY KEY,
      status     TEXT NOT NULL,
      payload    TEXT NOT NULL,
      context    TEXT NOT NULL,
      plan       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id     TEXT NOT NULL REFERENCES runs(id),
      type       TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: add plan column if missing
  const cols = db.pragma("table_info(runs)") as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "plan")) {
    db.exec("ALTER TABLE runs ADD COLUMN plan TEXT");
  }

  return db;
}
