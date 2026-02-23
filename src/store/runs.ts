import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { RunPayload, RunContext, RunStatus } from "../domain/types.js";
import type { EventBus } from "../services/event-bus.js";

export interface Run {
  id: string;
  status: RunStatus;
  payload: RunPayload;
  context: RunContext;
  plan?: string;
  questions?: string[];
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
  questions: string | null;
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
    questions: row.questions ? JSON.parse(row.questions) as string[] : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RunStore {
  private readonly eventBus?: EventBus;

  constructor(private readonly db: Database.Database, eventBus?: EventBus) {
    this.eventBus = eventBus;
  }

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
    this.eventBus?.emitStatusChange({ runId: id, status, timestamp: new Date().toISOString() });
  }

  updatePlan(id: string, plan: string): void {
    this.db
      .prepare(
        "UPDATE runs SET plan = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(plan, id);
  }

  updateQuestions(id: string, questions: string[]): void {
    this.db
      .prepare(
        "UPDATE runs SET questions = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(JSON.stringify(questions), id);
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
    this.eventBus?.emitRunEvent({ runId: id, type, data, timestamp: new Date().toISOString() });
  }

  listEvents(runId: string) {
    const rows = this.db.prepare('SELECT id, run_id, type, data, created_at FROM events WHERE run_id = ? ORDER BY created_at').all(runId) as any[];
    return rows.map(r => ({ id: r.id, runId: r.run_id, type: r.type, data: JSON.parse(r.data), createdAt: r.created_at }));
  }

  findActiveByTicketUrl(ticketUrl: string): Run | undefined {
    const row = this.db.prepare(
      "SELECT * FROM runs WHERE json_extract(payload, '$.ticketUrl') = ? AND status NOT IN ('DONE', 'FAILED', 'ESCALATED') LIMIT 1"
    ).get(ticketUrl) as any;
    if (!row) return undefined;
    return { id: row.id, status: row.status, payload: JSON.parse(row.payload), context: JSON.parse(row.context), plan: row.plan ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM events WHERE run_id = ?").run(id);
    this.db.prepare("DELETE FROM runs WHERE id = ?").run(id);
  }
}
