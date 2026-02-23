import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

export function createArchitectNode(deps: NodeDeps) {
  return async function architectNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { runId, worktreePath } = state.context;

    deps.syncStatus(runId, RunStatus.PLANNING);

    const onEvent = (type: string, data: unknown) => deps.emitEvent(runId, type, data);

    const extraVars: Record<string, string> = {};
    if (state.answers?.length) {
      const qa = state.questions
        ?.map((q, i) => `Q: ${q}\nA: ${state.answers![i] ?? "No answer"}`)
        .join("\n\n");
      extraVars["clarificationQA"] = qa ?? "";
    }

    const output = await deps.agent.runAgent(
      "architect",
      worktreePath ?? "",
      state.context,
      Object.keys(extraVars).length ? extraVars : undefined,
      onEvent
    );

    deps.syncPlan(runId, output);
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
