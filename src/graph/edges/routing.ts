import { RunStatus } from "../../domain/types.js";
import { MAX_VALIDATION_LOOPS, MAX_REVIEWER_LOOPS } from "../../domain/constants.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "../nodes/deps.js";

export function routeAfterApproval(
  state: CodingState
): "coder" | "architect" | "__end__" {
  if (state.resumeAction === "approve") return "coder";
  if (state.resumeAction === "revise") return "architect";
  return "__end__";
}

export function routeAfterValidation(
  state: CodingState
): "reviewer" | "escalate" | "coder" {
  if (!state.error) return "reviewer";
  if (state.codeIterations >= MAX_VALIDATION_LOOPS) return "escalate";
  return "coder";
}

export function routeAfterCi(
  state: CodingState
): "await_ci" | "cleanup" {
  if (state.resumeAction === "retry") return "await_ci";
  return "cleanup";
}

export function routeAfterReview(
  state: CodingState
): "finalize" | "escalate" | "coder" {
  if (!state.error) return "finalize";
  if (state.reviewIterations >= MAX_REVIEWER_LOOPS) return "escalate";
  return "coder";
}

export function createEscalateNode(deps: NodeDeps) {
  return async function escalateNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { runId, chatId, requesterId, ticketUrl, jiraIssue } = state.context;
    const reason = state.escalationReason ?? state.error ?? "Max iterations reached";

    await deps.notifier.notify({
      runId,
      status: "escalated",
      message: reason,
      chatId,
      requesterId,
      ticketKey: jiraIssue?.key,
      ticketUrl,
    });

    return {
      status: RunStatus.ESCALATED,
      escalationReason: reason,
    };
  };
}
