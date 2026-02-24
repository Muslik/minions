import { interrupt } from "@langchain/langgraph";
import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { ResumeAction } from "../../domain/types.js";
import type { NodeDeps } from "./deps.js";

interface ResumePayload {
  action: ResumeAction;
  comment?: string;
}

export function createAwaitApprovalNode(deps: NodeDeps) {
  return async function awaitApprovalNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    // Rerun with reused plan: auto-approve and continue to coder.
    if (state.resumeAction === "approve") {
      return {
        resumeAction: "approve",
        resumeComment: state.resumeComment,
      };
    }

    const { runId, chatId, requesterId, ticketUrl, jiraIssue } = state.context;
    const ticketKey = jiraIssue?.key;

    await deps.notifier.notify({
      runId,
      status: "awaiting_approval",
      message: state.plan ?? "(no plan)",
      chatId,
      requesterId,
      ticketKey,
      ticketUrl,
      data: { plan: state.plan },
      actions: [
        { label: "✅ Approve", endpoint: `/api/v1/runs/${runId}/resume`, body: { action: "approve" } },
        { label: "✏️ Revise", endpoint: `/api/v1/runs/${runId}/resume`, body: { action: "revise" } },
        { label: "❌ Cancel", endpoint: `/api/v1/runs/${runId}/cancel`, body: {} },
      ],
    });

    const resume = interrupt<{ plan: string | undefined }, ResumePayload>({
      plan: state.plan,
    });

    if (resume.action === "cancel") {
      return {
        resumeAction: resume.action,
        status: RunStatus.FAILED,
        escalationReason: "Cancelled by user",
      };
    }

    return {
      resumeAction: resume.action,
      resumeComment: resume.comment,
    };
  };
}
