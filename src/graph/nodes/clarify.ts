import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

export function createClarifyNode(deps: NodeDeps) {
  return async function clarifyNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    // Rerun with reused plan: skip clarification stage.
    if (state.plan?.trim() && state.resumeAction === "approve") {
      return { status: RunStatus.PLANNING, questions: undefined };
    }

    const { runId, worktreePath } = state.context;

    const onEvent = (type: string, data: unknown) => deps.emitEvent(runId, type, data);

    const output = await deps.agent.runAgent(
      "clarify",
      worktreePath ?? "",
      state.context,
      undefined,
      onEvent
    );

    let questions: string[];
    try {
      questions = JSON.parse(output);
      if (!Array.isArray(questions)) throw new Error("not array");
    } catch {
      return { status: RunStatus.PLANNING, questions: undefined };
    }

    if (questions.length === 0) {
      return { status: RunStatus.PLANNING, questions: undefined };
    }

    return { status: RunStatus.CLARIFYING, questions };
  };
}
