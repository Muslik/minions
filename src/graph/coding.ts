import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { CodingStateAnnotation } from "../domain/state.js";
import type { NodeDeps } from "./nodes/deps.js";
import { createHydrateNode } from "./nodes/hydrate.js";
import { createArchitectNode } from "./nodes/architect.js";
import { createAwaitApprovalNode } from "./nodes/await-approval.js";
import { createClarifyNode } from "./nodes/clarify.js";
import { createAwaitClarificationNode } from "./nodes/await-clarification.js";
import { createCoderNode } from "./nodes/coder.js";
import { createValidateNode } from "./nodes/validate.js";
import { createReviewerNode } from "./nodes/reviewer.js";
import { createFinalizeNode } from "./nodes/finalize.js";
import { createAwaitCiNode } from "./nodes/await-ci.js";
import { createCleanupNode } from "./nodes/cleanup.js";
import {
  routeAfterApproval,
  routeAfterValidation,
  routeAfterReview,
  routeAfterCi,
  routeAfterClarify,
  routeAfterClarification,
  createEscalateNode,
} from "./edges/routing.js";

export function compileCodingGraph(
  deps: NodeDeps,
  checkpointer?: BaseCheckpointSaver
) {
  const compiled = new StateGraph(CodingStateAnnotation)
    .addNode("hydrate", createHydrateNode(deps))
    .addNode("clarify", createClarifyNode(deps))
    .addNode("await_clarification", createAwaitClarificationNode(deps))
    .addNode("architect", createArchitectNode(deps))
    .addNode("await_approval", createAwaitApprovalNode(deps))
    .addNode("coder", createCoderNode(deps))
    .addNode("validate", createValidateNode(deps))
    .addNode("reviewer", createReviewerNode(deps))
    .addNode("finalize", createFinalizeNode(deps))
    .addNode("await_ci", createAwaitCiNode(deps))
    .addNode("cleanup", createCleanupNode(deps))
    .addNode("escalate", createEscalateNode(deps))
    .addEdge(START, "hydrate")
    .addEdge("hydrate", "clarify")
    .addConditionalEdges("clarify", routeAfterClarify, {
      await_clarification: "await_clarification",
      architect: "architect",
    })
    .addConditionalEdges("await_clarification", routeAfterClarification, {
      architect: "architect",
      __end__: END,
    })
    .addEdge("architect", "await_approval")
    .addEdge("coder", "validate")
    .addEdge("finalize", "await_ci")
    .addConditionalEdges("await_ci", routeAfterCi, {
      await_ci: "await_ci",
      cleanup: "cleanup",
    })
    .addEdge("cleanup", END)
    .addEdge("escalate", "cleanup")
    .addConditionalEdges("await_approval", routeAfterApproval, {
      coder: "coder",
      architect: "architect",
      cleanup: "cleanup",
    })
    .addConditionalEdges("validate", routeAfterValidation, {
      reviewer: "reviewer",
      escalate: "escalate",
      coder: "coder",
    })
    .addConditionalEdges("reviewer", routeAfterReview, {
      finalize: "finalize",
      escalate: "escalate",
      coder: "coder",
    })
    .compile({ checkpointer });

  return compiled;
}
