import { interrupt } from "@langchain/langgraph";
import type { CodingState } from "../../domain/state.js";
import type { ResumeAction } from "../../domain/types.js";
import type { NodeDeps } from "./deps.js";

interface ResumePayload {
  action: ResumeAction;
  comment?: string;
  answers?: string[];
}

export function createAwaitClarificationNode(deps: NodeDeps) {
  return async function awaitClarificationNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { runId, chatId, requesterId, ticketUrl, jiraIssue } = state.context;

    await deps.notifier.notify({
      runId,
      status: "clarifying",
      message: `Questions for ${jiraIssue?.key}`,
      chatId,
      requesterId,
      ticketKey: jiraIssue?.key,
      ticketUrl,
      data: { questions: state.questions },
      actions: [
        { label: "❌ Cancel", endpoint: `/api/v1/runs/${runId}/cancel`, body: {} },
      ],
    });

    const resume = interrupt<{ questions: string[] | undefined }, ResumePayload>({
      questions: state.questions,
    });

    if (resume.action === "cancel") {
      return { resumeAction: "cancel" };
    }

    return {
      resumeAction: resume.action,
      answers: resume.answers,
    };
  };
}
