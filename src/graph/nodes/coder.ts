import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

export function createCoderNode(deps: NodeDeps) {
  return async function coderNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { worktreePath } = state.context;

    const extra: Record<string, string> = {};
    if (state.plan) extra["plan"] = state.plan;
    if (state.resumeComment) extra["reviewComment"] = state.resumeComment;
    if (state.error) extra["validationError"] = state.error;

    await deps.agent.runAgent("coder", worktreePath ?? "", state.context, extra);

    return {
      status: RunStatus.VALIDATING,
      codeIterations: 1,
      error: undefined,
    };
  };
}
