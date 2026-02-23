import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

export function createCleanupNode(deps: NodeDeps) {
  return async function cleanupNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { worktreePath, prUrl, runId, chatId, requesterId, ticketUrl, jiraIssue } = state.context;

    if (worktreePath) {
      try {
        deps.git.removeWorktree(worktreePath);
      } catch {
        // best-effort cleanup
      }
    }

    const isTerminal = state.status === RunStatus.ESCALATED || state.status === RunStatus.FAILED;
    const finalStatus = isTerminal ? state.status : RunStatus.DONE;
    const notifyStatus =
      state.status === RunStatus.ESCALATED ? "escalated"
      : state.status === RunStatus.FAILED ? "cancelled"
      : "done";

    const ciLabel =
      state.ciStatus === "SUCCESSFUL"
        ? " | CI ✅"
        : state.ciStatus === "FAILED"
          ? " | CI ❌"
          : "";
    const message = state.context?.prUrl
      ? `PR created${ciLabel}`
      : "Run completed without PR";

    await deps.notifier.notify({
      runId,
      status: notifyStatus,
      message,
      chatId,
      requesterId,
      ticketKey: jiraIssue?.key,
      ticketUrl,
      data: { prUrl },
    });

    // VPN is a shared resource (OpenClaw also uses it) — don't stop it here.
    // It will be stopped by the system idle timer or manually.

    return {
      status: finalStatus,
    };
  };
}
