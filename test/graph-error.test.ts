import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RunStatus } from "../src/domain/types.ts";
import { classifyGraphFailure } from "../src/services/graph-error.ts";

describe("classifyGraphFailure", () => {
  it("classifies recursion-limit errors as ESCALATED", () => {
    const err = new Error(
      'Recursion limit of 140 reached without hitting a stop condition. Set "recursionLimit" config key.'
    );

    const result = classifyGraphFailure(err);

    assert.equal(result.runStatus, RunStatus.ESCALATED);
    assert.equal(result.notifyStatus, "escalated");
    assert.equal(result.eventType, "escalation");
    assert.equal(result.errorCode, "GRAPH_RECURSION_LIMIT");
  });

  it("classifies non-recursion errors as FAILED", () => {
    const result = classifyGraphFailure(new Error("Network timeout"));
    assert.equal(result.runStatus, RunStatus.FAILED);
    assert.equal(result.notifyStatus, "failed");
    assert.equal(result.eventType, "error");
    assert.equal(result.errorCode, undefined);
  });
});

