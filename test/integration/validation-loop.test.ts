import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { RunStatus } from "../../src/domain/types.ts";
import type { CodingState } from "../../src/domain/state.ts";
import {
  routeAfterValidation,
  routeAfterReview,
} from "../../src/graph/edges/routing.ts";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<CodingState> = {}): CodingState {
  return {
    runId: "run-1",
    status: RunStatus.VALIDATING,
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
    plan: undefined,
    codeIterations: 0,
    reviewIterations: 0,
    error: undefined,
    escalationReason: undefined,
    resumeAction: undefined,
    resumeComment: undefined,
    questions: undefined,
    answers: undefined,
    ciStatus: undefined,
    ciBuildUrl: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Validation loop routing (routeAfterValidation)
// MAX_VALIDATION_LOOPS = 2
// ---------------------------------------------------------------------------

describe("validation-loop: routeAfterValidation", () => {
  it("returns 'reviewer' when there is no error", () => {
    const state = makeState({ error: undefined, codeIterations: 0 });
    assert.equal(routeAfterValidation(state), "reviewer");
  });

  it("returns 'coder' when error is set and codeIterations=0", () => {
    const state = makeState({ error: "build failed", codeIterations: 0 });
    assert.equal(routeAfterValidation(state), "coder");
  });

  it("returns 'coder' when error is set and codeIterations=1", () => {
    const state = makeState({ error: "build failed", codeIterations: 1 });
    assert.equal(routeAfterValidation(state), "coder");
  });

  it("returns 'escalate' when error is set and codeIterations=2 (MAX_VALIDATION_LOOPS)", () => {
    const state = makeState({ error: "build failed", codeIterations: 2 });
    assert.equal(routeAfterValidation(state), "escalate");
  });

  it("returns 'escalate' when error is set and codeIterations exceeds MAX_VALIDATION_LOOPS", () => {
    const state = makeState({ error: "build failed", codeIterations: 5 });
    assert.equal(routeAfterValidation(state), "escalate");
  });
});

// ---------------------------------------------------------------------------
// Review loop routing (routeAfterReview)
// MAX_REVIEWER_LOOPS = 2
// ---------------------------------------------------------------------------

describe("validation-loop: routeAfterReview", () => {
  it("returns 'finalize' when there is no error", () => {
    const state = makeState({ error: undefined, reviewIterations: 0 });
    assert.equal(routeAfterReview(state), "finalize");
  });

  it("returns 'coder' when error is set and reviewIterations=0", () => {
    const state = makeState({ error: "needs refactor", reviewIterations: 0 });
    assert.equal(routeAfterReview(state), "coder");
  });

  it("returns 'escalate' when error is set and reviewIterations=2 (MAX_REVIEWER_LOOPS)", () => {
    const state = makeState({ error: "needs refactor", reviewIterations: 2 });
    assert.equal(routeAfterReview(state), "escalate");
  });

  it("returns 'escalate' when error is set and reviewIterations exceeds MAX_REVIEWER_LOOPS", () => {
    const state = makeState({ error: "needs refactor", reviewIterations: 10 });
    assert.equal(routeAfterReview(state), "escalate");
  });
});
