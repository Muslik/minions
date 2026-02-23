import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

export function createCoderNode(deps: NodeDeps) {
  return async function coderNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { worktreePath, runId, chatId, requesterId, ticketUrl, jiraIssue } = state.context;

    await deps.notifier.notify({
      runId,
      status: "coding",
      message: "Пишу код по плану...",
      chatId,
      requesterId,
      ticketKey: jiraIssue?.key,
      ticketUrl,
    });

    const extra: Record<string, string> = {};
    if (state.plan) extra["plan"] = state.plan;
    if (state.resumeComment) extra["reviewComment"] = state.resumeComment;
    if (state.error) extra["validationError"] = state.error;

    const onEvent = (type: string, data: unknown) => deps.emitEvent(runId, type, data);

    await deps.agent.runAgent("coder", worktreePath ?? "", state.context, extra, onEvent);

    return {
      status: RunStatus.VALIDATING,
      codeIterations: 1,
      error: undefined,
    };
  };
}
