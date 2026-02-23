import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { RunStatus } from "../../src/domain/types.ts";
import type { CodingState } from "../../src/domain/state.ts";
import { routeAfterApproval } from "../../src/graph/edges/routing.ts";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<CodingState> = {}): CodingState {
  return {
    runId: "run-1",
    status: RunStatus.AWAITING_APPROVAL,
    payload: {
      ticketUrl: "https://jira.example.com/browse/TEST-1",
      chatId: "chat-1",
      requesterId: "user-1",
    },
    context: {
      runId: "run-1",
      ticketUrl: "https://jira.example.com/browse/TEST-1",
      chatId: "chat-1",
      requesterId: "user-1",
    },
    plan: "# Plan\n- Fix the bug",
    codeIterations: 0,
    reviewIterations: 0,
    error: undefined,
    escalationReason: undefined,
    resumeAction: undefined,
    resumeComment: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HITL approval routing (routeAfterApproval)
// ---------------------------------------------------------------------------

describe("approval-routing: routeAfterApproval", () => {
  it("routes to 'coder' when resumeAction is 'approve'", () => {
    const state = makeState({ resumeAction: "approve" });
    assert.equal(routeAfterApproval(state), "coder");
  });

  it("routes to 'architect' when resumeAction is 'revise'", () => {
    const state = makeState({ resumeAction: "revise" });
    assert.equal(routeAfterApproval(state), "architect");
  });

  it("routes to 'cleanup' when resumeAction is 'cancel'", () => {
    const state = makeState({ resumeAction: "cancel" });
    assert.equal(routeAfterApproval(state), "cleanup");
  });

  it("routes to 'cleanup' when resumeAction is undefined", () => {
    const state = makeState({ resumeAction: undefined });
    assert.equal(routeAfterApproval(state), "cleanup");
  });
});
