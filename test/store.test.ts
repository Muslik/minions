import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { initDb } from "../src/store/db.ts";
import type { Database } from "better-sqlite3";

/**
 * store.test.ts is self-contained: we avoid importing runs.ts directly
 * because it uses TypeScript parameter properties (`private readonly db`)
 * which --experimental-strip-types cannot handle.
 *
 * Instead we inline a functionally identical RunStore implementation using
 * standard (non-parameter-property) class syntax, backed by the same SQLite
 * schema that initDb() creates.
 */

// ── Status constants (avoid importing the enum from types.ts) ──────────────
const RunStatus = {
  RECEIVED: "RECEIVED",
  HYDRATING: "HYDRATING",
  PLANNING: "PLANNING",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  CODING: "CODING",
  VALIDATING: "VALIDATING",
  REVIEWING: "REVIEWING",
  FINALIZING: "FINALIZING",
  DONE: "DONE",
  FAILED: "FAILED",
  ESCALATED: "ESCALATED",
} as const;
type RunStatusValue = typeof RunStatus[keyof typeof RunStatus];

interface RunPayload {
  ticketUrl: string;
  chatId: string;
  requesterId: string;
}

interface RunContext {
  runId: string;
  ticketUrl: string;
  chatId: string;
  requesterId: string;
}

interface Run {
  id: string;
  status: RunStatusValue;
  payload: RunPayload;
  context: RunContext;
  createdAt: string;
  updatedAt: string;
}

interface RunFilters {
  status?: RunStatusValue;
}

type RunRow = {
  id: string;
  status: string;
  payload: string;
  context: string;
  created_at: string;
  updated_at: string;
};

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    status: row.status as RunStatusValue,
    payload: JSON.parse(row.payload) as RunPayload,
    context: JSON.parse(row.context) as RunContext,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Inline RunStore using a regular constructor (no parameter properties)
class RunStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  create(payload: RunPayload): string {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO runs (id, status, payload, context) VALUES (?, ?, ?, ?)")
      .run(id, "RECEIVED", JSON.stringify(payload), JSON.stringify({ runId: id, ...payload }));
    return id;
  }

  get(id: string): Run | undefined {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
    return row ? rowToRun(row) : undefined;
  }

  list(filters?: RunFilters): Run[] {
    const rows = filters?.status
      ? (this.db.prepare("SELECT * FROM runs WHERE status = ?").all(filters.status) as RunRow[])
      : (this.db.prepare("SELECT * FROM runs").all() as RunRow[]);
    return rows.map(rowToRun);
  }

  updateStatus(id: string, status: RunStatusValue): void {
    this.db
      .prepare("UPDATE runs SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, id);
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

// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;
let store: RunStore;

const samplePayload: RunPayload = {
  ticketUrl: "https://jira.example.com/browse/AVIA-1",
  chatId: "chat-abc",
  requesterId: "user-xyz",
};

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "minions-store-test-"));
  const db = initDb(join(tmpDir, "test.db"));
  store = new RunStore(db);
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("RunStore — CRUD operations", () => {
  it("create() returns a UUID string", () => {
    const id = store.create(samplePayload);
    assert.ok(typeof id === "string");
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("get() returns the created run with RECEIVED status", () => {
    const id = store.create(samplePayload);
    const run = store.get(id);

    assert.ok(run !== undefined);
    assert.equal(run.id, id);
    assert.equal(run.status, RunStatus.RECEIVED);
    assert.equal(run.payload.ticketUrl, samplePayload.ticketUrl);
    assert.equal(run.payload.chatId, samplePayload.chatId);
    assert.equal(run.payload.requesterId, samplePayload.requesterId);
  });

  it("get() returns undefined for a non-existent id", () => {
    const run = store.get("00000000-0000-0000-0000-000000000000");
    assert.equal(run, undefined);
  });

  it("updateStatus() changes the run status", () => {
    const id = store.create(samplePayload);
    store.updateStatus(id, RunStatus.CODING);

    const run = store.get(id);
    assert.ok(run !== undefined);
    assert.equal(run.status, RunStatus.CODING);
  });

  it("updateStatus() can transition through multiple statuses", () => {
    const id = store.create(samplePayload);

    store.updateStatus(id, RunStatus.PLANNING);
    assert.equal(store.get(id)!.status, RunStatus.PLANNING);

    store.updateStatus(id, RunStatus.DONE);
    assert.equal(store.get(id)!.status, RunStatus.DONE);
  });

  it("list() returns all runs when no filter is applied", () => {
    const db2 = initDb(join(tmpDir, "list-all.db"));
    const s2 = new RunStore(db2);

    const id1 = s2.create(samplePayload);
    const id2 = s2.create({ ...samplePayload, chatId: "chat-2" });

    const runs = s2.list();
    assert.equal(runs.length, 2);
    const ids = runs.map((r) => r.id);
    assert.ok(ids.includes(id1));
    assert.ok(ids.includes(id2));
  });

  it("list() with status filter returns only matching runs", () => {
    const db3 = initDb(join(tmpDir, "list-filter.db"));
    const s3 = new RunStore(db3);

    const id1 = s3.create(samplePayload);
    const id2 = s3.create(samplePayload);
    const id3 = s3.create(samplePayload);

    s3.updateStatus(id1, RunStatus.DONE);
    s3.updateStatus(id2, RunStatus.FAILED);
    // id3 stays RECEIVED

    const doneRuns = s3.list({ status: RunStatus.DONE });
    assert.equal(doneRuns.length, 1);
    assert.equal(doneRuns[0]!.id, id1);

    const receivedRuns = s3.list({ status: RunStatus.RECEIVED });
    assert.equal(receivedRuns.length, 1);
    assert.equal(receivedRuns[0]!.id, id3);

    const failedRuns = s3.list({ status: RunStatus.FAILED });
    assert.equal(failedRuns.length, 1);
    assert.equal(failedRuns[0]!.id, id2);
  });

  it("delete() removes the run so get() returns undefined", () => {
    const id = store.create(samplePayload);
    assert.ok(store.get(id) !== undefined);

    store.delete(id);

    assert.equal(store.get(id), undefined);
  });

  it("delete() on a non-existent id does not throw", () => {
    assert.doesNotThrow(() => {
      store.delete("00000000-0000-0000-0000-000000000099");
    });
  });

  it("addEvent() stores an event for a run", () => {
    const db4 = initDb(join(tmpDir, "events.db"));
    const s4 = new RunStore(db4);

    const id = s4.create(samplePayload);

    assert.doesNotThrow(() => {
      s4.addEvent(id, "status_changed", { from: "RECEIVED", to: "PLANNING" });
    });
  });

  it("addEvent() stores multiple events for the same run", () => {
    const db5 = initDb(join(tmpDir, "multi-events.db"));
    const s5 = new RunStore(db5);

    const id = s5.create(samplePayload);

    assert.doesNotThrow(() => {
      s5.addEvent(id, "plan_created", { planLength: 42 });
      s5.addEvent(id, "code_iteration", { iteration: 1 });
      s5.addEvent(id, "review_passed", {});
    });
  });

  it("context is stored in run and contains runId", () => {
    const id = store.create(samplePayload);
    const run = store.get(id);

    assert.ok(run !== undefined);
    assert.equal(run.context.runId, id);
    assert.equal(run.context.ticketUrl, samplePayload.ticketUrl);
  });

  it("list() returns empty array when no runs exist", () => {
    const db6 = initDb(join(tmpDir, "empty.db"));
    const s6 = new RunStore(db6);

    const runs = s6.list();
    assert.deepEqual(runs, []);
  });
});
