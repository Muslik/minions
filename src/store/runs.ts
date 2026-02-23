import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { RunPayload, RunContext, RunStatus } from "../domain/types.js";

export interface Run {
  id: string;
  status: RunStatus;
  payload: RunPayload;
  context: RunContext;
  plan?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunEvent {
  id: number;
  runId: string;
  type: string;
  data: unknown;
  createdAt: string;
}

export interface RunFilters {
  status?: RunStatus;
}

type RunRow = {
  id: string;
  status: string;
  payload: string;
  context: string;
  plan: string | null;
  created_at: string;
  updated_at: string;
};

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    status: row.status as RunStatus,
    payload: JSON.parse(row.payload) as RunPayload,
    context: JSON.parse(row.context) as RunContext,
    plan: row.plan ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RunStore {
  constructor(private readonly db: Database.Database) {}

  create(payload: RunPayload): string {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO runs (id, status, payload, context) VALUES (?, ?, ?, ?)"
      )
      .run(
        id,
        "RECEIVED",
        JSON.stringify(payload),
        JSON.stringify({ runId: id, ...payload })
      );
    return id;
  }

  get(id: string): Run | undefined {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get(id) as RunRow | undefined;
    return row ? rowToRun(row) : undefined;
  }

  list(filters?: RunFilters): Run[] {
    const rows = filters?.status
      ? (this.db
          .prepare("SELECT * FROM runs WHERE status = ?")
          .all(filters.status) as RunRow[])
      : (this.db.prepare("SELECT * FROM runs").all() as RunRow[]);
    return rows.map(rowToRun);
  }

  updateStatus(id: string, status: RunStatus): void {
    this.db
      .prepare(
        "UPDATE runs SET status = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(status, id);
  }

  updatePlan(id: string, plan: string): void {
    this.db
      .prepare(
        "UPDATE runs SET plan = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(plan, id);
  }

  updateContext(id: string, ctx: RunContext): void {
    this.db
      .prepare(
        "UPDATE runs SET context = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(JSON.stringify(ctx), id);
  }

  addEvent(id: string, type: string, data: unknown): void {
    this.db
      .prepare("INSERT INTO events (run_id, type, data) VALUES (?, ?, ?)")
      .run(id, type, JSON.stringify(data));
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM runs WHERE id = ?").run(id);
  }
}
