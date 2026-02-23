import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

export function createArchitectNode(deps: NodeDeps) {
  return async function architectNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { runId, worktreePath } = state.context;

    const onEvent = (type: string, data: unknown) => deps.emitEvent(runId, type, data);

    const output = await deps.agent.runAgent(
      "architect",
      worktreePath ?? "",
      state.context,
      undefined,
      onEvent
    );

    deps.artifacts.saveArtifact(
      deps.config.storage.artifactsDir,
      runId,
      "plan.md",
      output
    );

    return {
      status: RunStatus.AWAITING_APPROVAL,
      plan: output,
    };
  };
}
