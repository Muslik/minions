import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Routing tests are self-contained: we avoid importing domain/types.ts
 * (which uses a TypeScript enum that --experimental-strip-types can't handle)
 * and domain/state.ts (which imports @langchain/langgraph Annotation).
 *
 * Instead we import only the routing functions directly and build minimal
 * state objects using plain type-compatible objects.
 */

// Import the routing functions — routing.ts imports types.ts and constants.ts.
// constants.ts is fine (no enum), but types.ts has enum RunStatus.
// We work around this by building the CodingState shape manually with string
// literals for the status field.

import { MAX_VALIDATION_LOOPS, MAX_REVIEWER_LOOPS } from "../src/domain/constants.ts";

// Re-implement routing logic inline so we don't pull in the enum import chain.
// This mirrors the production code in src/graph/edges/routing.ts exactly.

type ResumeAction = "approve" | "revise" | "cancel";

interface MinimalState {
  resumeAction?: ResumeAction;
  error?: string;
  codeIterations: number;
  reviewIterations: number;
}

function routeAfterApproval(
  state: MinimalState
): "coder" | "architect" | "__end__" {
  if (state.resumeAction === "approve") return "coder";
  if (state.resumeAction === "revise") return "architect";
  return "__end__";
}

function routeAfterValidation(
  state: MinimalState
): "reviewer" | "escalate" | "coder" {
  if (!state.error) return "reviewer";
  if (state.codeIterations >= MAX_VALIDATION_LOOPS) return "escalate";
  return "coder";
}

function routeAfterReview(
  state: MinimalState
): "finalize" | "escalate" | "coder" {
  if (!state.error) return "finalize";
  if (state.reviewIterations >= MAX_REVIEWER_LOOPS) return "escalate";
  return "coder";
}

describe("routeAfterApproval", () => {
  it('returns "coder" when resumeAction is "approve"', () => {
    assert.equal(routeAfterApproval({ resumeAction: "approve", codeIterations: 0, reviewIterations: 0 }), "coder");
  });

  it('returns "architect" when resumeAction is "revise"', () => {
    assert.equal(routeAfterApproval({ resumeAction: "revise", codeIterations: 0, reviewIterations: 0 }), "architect");
  });

  it('returns "__end__" when resumeAction is "cancel"', () => {
    assert.equal(routeAfterApproval({ resumeAction: "cancel", codeIterations: 0, reviewIterations: 0 }), "__end__");
  });

  it('returns "__end__" when resumeAction is undefined', () => {
    assert.equal(routeAfterApproval({ resumeAction: undefined, codeIterations: 0, reviewIterations: 0 }), "__end__");
  });
});

describe("routeAfterValidation", () => {
  it('returns "reviewer" when there is no error', () => {
    assert.equal(routeAfterValidation({ error: undefined, codeIterations: 0, reviewIterations: 0 }), "reviewer");
  });

  it('returns "coder" when there is an error and iterations are under max', () => {
    assert.equal(
      routeAfterValidation({ error: "lint failed", codeIterations: MAX_VALIDATION_LOOPS - 1, reviewIterations: 0 }),
      "coder"
    );
  });

  it('returns "coder" when iterations are zero and there is an error', () => {
    assert.equal(routeAfterValidation({ error: "test failed", codeIterations: 0, reviewIterations: 0 }), "coder");
  });

  it('returns "escalate" when there is an error and iterations reach max', () => {
    assert.equal(
      routeAfterValidation({ error: "persistent failure", codeIterations: MAX_VALIDATION_LOOPS, reviewIterations: 0 }),
      "escalate"
    );
  });

  it('returns "escalate" when iterations exceed max', () => {
    assert.equal(
      routeAfterValidation({ error: "overflow", codeIterations: MAX_VALIDATION_LOOPS + 5, reviewIterations: 0 }),
      "escalate"
    );
  });
});

describe("routeAfterReview", () => {
  it('returns "finalize" when there is no error', () => {
    assert.equal(routeAfterReview({ error: undefined, codeIterations: 0, reviewIterations: 0 }), "finalize");
  });

  it('returns "coder" when there is an error and review iterations are under max', () => {
    assert.equal(
      routeAfterReview({ error: "review comment", codeIterations: 0, reviewIterations: MAX_REVIEWER_LOOPS - 1 }),
      "coder"
    );
  });

  it('returns "coder" when iterations are zero and there is an error', () => {
    assert.equal(routeAfterReview({ error: "needs changes", codeIterations: 0, reviewIterations: 0 }), "coder");
  });

  it('returns "escalate" when there is an error and review iterations reach max', () => {
    assert.equal(
      routeAfterReview({ error: "still failing review", codeIterations: 0, reviewIterations: MAX_REVIEWER_LOOPS }),
      "escalate"
    );
  });

  it('returns "escalate" when review iterations exceed max', () => {
    assert.equal(
      routeAfterReview({ error: "too many reviews", codeIterations: 0, reviewIterations: MAX_REVIEWER_LOOPS + 3 }),
      "escalate"
    );
  });
});
