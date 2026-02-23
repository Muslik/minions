import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

export function createCleanupNode(deps: NodeDeps) {
  return async function cleanupNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { worktreePath, prUrl } = state.context;
    const { runId } = state.context;

    if (worktreePath) {
      try {
        deps.git.removeWorktree(worktreePath);
      } catch {
        // best-effort cleanup
      }
    }

    const finalStatus =
      state.status === RunStatus.ESCALATED ? RunStatus.ESCALATED : RunStatus.DONE;
    const notifyStatus = state.status === RunStatus.ESCALATED ? "escalated" : "done";
    const message = state.context?.prUrl ? "PR created" : "Run completed without PR";

    await deps.notifier.notify({
      runId,
      status: notifyStatus,
      message,
      data: { prUrl },
    });

    return {
      status: finalStatus,
    };
  };
}
