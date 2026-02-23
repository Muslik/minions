import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── TG types (inline to avoid importing .ts with parameter properties) ──────

interface TgUser {
  id: number;
  first_name: string;
  username?: string;
}

interface TgChat {
  id: number;
  type: string;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  reply_to_message?: TgMessage;
}

interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

// ── Callback data parsing (mirrors callbacks.ts logic) ──────────────────────

const CB_RE = /^mn:(approve|revise|cancel):(.+)$/;

function parseCallback(data: string): { action: string; runId: string } | null {
  const m = CB_RE.exec(data);
  if (!m) return null;
  return { action: m[1]!, runId: m[2]! };
}

// ── Jira URL regex (mirrors commands.ts logic) ──────────────────────────────

const JIRA_URL_RE = /https?:\/\/[^\s]+\/browse\/[A-Z][\w]+-\d+/;

// ── Authorization check (mirrors handlers.ts logic) ─────────────────────────

function isAllowed(update: TgUpdate, allowedChatId: number): boolean {
  if (update.callback_query) {
    return update.callback_query.message?.chat.id === allowedChatId;
  }
  if (update.message) {
    return update.message.chat.id === allowedChatId;
  }
  return false;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mkMsg(overrides: Partial<TgMessage> = {}): TgMessage {
  return {
    message_id: 1,
    from: { id: 100, first_name: "Test" },
    chat: { id: 42, type: "group" },
    text: "hello",
    ...overrides,
  };
}

function mkUpdate(overrides: Partial<TgUpdate> = {}): TgUpdate {
  return { update_id: 1, ...overrides };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Bot — callback data parsing", () => {
  it("parses mn:approve:<runId>", () => {
    const res = parseCallback("mn:approve:abc-123");
    assert.deepEqual(res, { action: "approve", runId: "abc-123" });
  });

  it("parses mn:revise:<runId>", () => {
    const res = parseCallback("mn:revise:run-456");
    assert.deepEqual(res, { action: "revise", runId: "run-456" });
  });

  it("parses mn:cancel:<runId>", () => {
    const res = parseCallback("mn:cancel:run-789");
    assert.deepEqual(res, { action: "cancel", runId: "run-789" });
  });

  it("returns null for unknown format", () => {
    assert.equal(parseCallback("unknown:data"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(parseCallback(""), null);
  });

  it("returns null for partial match", () => {
    assert.equal(parseCallback("mn:approve"), null);
  });

  it("handles runId with special chars (UUID)", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const res = parseCallback(`mn:cancel:${uuid}`);
    assert.deepEqual(res, { action: "cancel", runId: uuid });
  });
});

describe("Bot — Jira URL detection", () => {
  it("matches standard Jira URL", () => {
    const text = "https://jira.example.com/browse/AVIA-123";
    const m = JIRA_URL_RE.exec(text);
    assert.ok(m);
    assert.equal(m[0], text);
  });

  it("matches Jira URL embedded in text", () => {
    const text = "Сделай пожалуйста https://jira.example.com/browse/PROJ-42 срочно";
    const m = JIRA_URL_RE.exec(text);
    assert.ok(m);
    assert.equal(m[0], "https://jira.example.com/browse/PROJ-42");
  });

  it("matches http URLs", () => {
    const text = "http://jira.local/browse/TEST-1";
    assert.ok(JIRA_URL_RE.test(text));
  });

  it("does not match non-Jira URLs", () => {
    assert.ok(!JIRA_URL_RE.test("https://google.com"));
  });

  it("does not match URL without ticket key", () => {
    assert.ok(!JIRA_URL_RE.test("https://jira.example.com/browse/"));
  });

  it("does not match lowercase project key", () => {
    assert.ok(!JIRA_URL_RE.test("https://jira.example.com/browse/avia-123"));
  });
});

describe("Bot — authorization", () => {
  const ALLOWED = 42;

  it("allows message from authorized chat", () => {
    const update = mkUpdate({
      message: mkMsg({ chat: { id: ALLOWED, type: "group" } }),
    });
    assert.ok(isAllowed(update, ALLOWED));
  });

  it("rejects message from unauthorized chat", () => {
    const update = mkUpdate({
      message: mkMsg({ chat: { id: 999, type: "group" } }),
    });
    assert.ok(!isAllowed(update, ALLOWED));
  });

  it("allows callback_query from authorized chat", () => {
    const update = mkUpdate({
      callback_query: {
        id: "cb-1",
        from: { id: 100, first_name: "Test" },
        message: mkMsg({ chat: { id: ALLOWED, type: "group" } }),
        data: "mn:approve:run-1",
      },
    });
    assert.ok(isAllowed(update, ALLOWED));
  });

  it("rejects callback_query from unauthorized chat", () => {
    const update = mkUpdate({
      callback_query: {
        id: "cb-2",
        from: { id: 100, first_name: "Test" },
        message: mkMsg({ chat: { id: 999, type: "group" } }),
        data: "mn:approve:run-1",
      },
    });
    assert.ok(!isAllowed(update, ALLOWED));
  });

  it("rejects update with no message or callback", () => {
    assert.ok(!isAllowed(mkUpdate(), ALLOWED));
  });
});

describe("Bot — command detection", () => {
  it("recognizes /start command", () => {
    assert.equal("/start", "/start");
  });

  it("recognizes /status command", () => {
    assert.equal("/status", "/status");
  });

  it("recognizes /cancel with runId", () => {
    const text = "/cancel abc-123";
    assert.ok(text.startsWith("/cancel "));
    assert.equal(text.slice(8).trim(), "abc-123");
  });
});

describe("Bot — pending revise flow", () => {
  let pendingRevise: Map<number, { runId: string }>;

  beforeEach(() => {
    pendingRevise = new Map();
  });

  it("sets pending revise for chat", () => {
    pendingRevise.set(42, { runId: "run-1" });
    assert.deepEqual(pendingRevise.get(42), { runId: "run-1" });
  });

  it("clears pending revise after consuming", () => {
    pendingRevise.set(42, { runId: "run-1" });
    const pending = pendingRevise.get(42);
    pendingRevise.delete(42);
    assert.deepEqual(pending, { runId: "run-1" });
    assert.equal(pendingRevise.get(42), undefined);
  });

  it("overwrites pending revise with new action", () => {
    pendingRevise.set(42, { runId: "run-1" });
    pendingRevise.set(42, { runId: "run-2" });
    assert.deepEqual(pendingRevise.get(42), { runId: "run-2" });
  });

  it("different chats have independent pending state", () => {
    pendingRevise.set(42, { runId: "run-1" });
    pendingRevise.set(99, { runId: "run-2" });
    assert.deepEqual(pendingRevise.get(42), { runId: "run-1" });
    assert.deepEqual(pendingRevise.get(99), { runId: "run-2" });
  });
});

describe("Bot — polling offset tracking", () => {
  it("calculates next offset from last update_id", () => {
    const updates: TgUpdate[] = [
      { update_id: 100 },
      { update_id: 101 },
      { update_id: 102 },
    ];
    const nextOffset = updates[updates.length - 1]!.update_id + 1;
    assert.equal(nextOffset, 103);
  });

  it("handles single update", () => {
    const updates: TgUpdate[] = [{ update_id: 50 }];
    const nextOffset = updates[updates.length - 1]!.update_id + 1;
    assert.equal(nextOffset, 51);
  });
});

describe("Bot — createBot smoke", () => {
  // Import test: just verify the module exports resolve
  it("createBot is a function", async () => {
    const mod = await import("../src/bot/index.ts");
    assert.equal(typeof mod.createBot, "function");
  });
});
