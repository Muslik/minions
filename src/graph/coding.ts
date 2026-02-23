import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { CodingStateAnnotation } from "../domain/state.js";
import type { NodeDeps } from "./nodes/deps.js";
import { createHydrateNode } from "./nodes/hydrate.js";
import { createArchitectNode } from "./nodes/architect.js";
import { createAwaitApprovalNode } from "./nodes/await-approval.js";
import { createCoderNode } from "./nodes/coder.js";
import { createValidateNode } from "./nodes/validate.js";
import { createReviewerNode } from "./nodes/reviewer.js";
import { createFinalizeNode } from "./nodes/finalize.js";
import { createCleanupNode } from "./nodes/cleanup.js";
import {
  routeAfterApproval,
  routeAfterValidation,
  routeAfterReview,
  createEscalateNode,
} from "./edges/routing.js";

export function compileCodingGraph(
  deps: NodeDeps,
  checkpointer?: BaseCheckpointSaver
) {
  const compiled = new StateGraph(CodingStateAnnotation)
    .addNode("hydrate", createHydrateNode(deps))
    .addNode("architect", createArchitectNode(deps))
    .addNode("await_approval", createAwaitApprovalNode(deps))
    .addNode("coder", createCoderNode(deps))
    .addNode("validate", createValidateNode(deps))
    .addNode("reviewer", createReviewerNode(deps))
    .addNode("finalize", createFinalizeNode(deps))
    .addNode("cleanup", createCleanupNode(deps))
    .addNode("escalate", createEscalateNode(deps))
    .addEdge(START, "hydrate")
    .addEdge("hydrate", "architect")
    .addEdge("architect", "await_approval")
    .addEdge("coder", "validate")
    .addEdge("finalize", "cleanup")
    .addEdge("cleanup", END)
    .addEdge("escalate", "cleanup")
    .addConditionalEdges("await_approval", routeAfterApproval, {
      coder: "coder",
      architect: "architect",
      __end__: END,
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
