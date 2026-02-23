import { RunStatus } from "../domain/types.js";
import type { RunStore } from "../store/runs.js";
import type { NodeDeps } from "../graph/nodes/deps.js";
import type { CompiledGraph } from "../api/server.js";

export interface LaunchRunParams {
  ticketUrl: string;
  chatId: string;
  requesterId: string;
}

export function launchRun(
  params: LaunchRunParams,
  runStore: RunStore,
  graph: CompiledGraph,
  deps: NodeDeps
): string {
  const { ticketUrl, chatId, requesterId } = params;
  const runId = runStore.create({ ticketUrl, chatId, requesterId });

  graph
    .invoke(
      {
        runId,
        payload: { ticketUrl, chatId, requesterId },
        context: { runId, ticketUrl, chatId, requesterId },
      },
      { configurable: { thread_id: runId } }
    )
    .then((finalState) => {
      runStore.updateStatus(runId, finalState.status);
      if (finalState.context) {
        runStore.updateContext(runId, finalState.context);
      }
      if (finalState.plan) {
        runStore.updatePlan(runId, finalState.plan);
      }
    })
    .catch(async (err: unknown) => {
      console.error(`Graph run ${runId} failed:`, err);
      runStore.updateStatus(runId, RunStatus.FAILED);
      runStore.addEvent(runId, "error", { message: String(err) });
      await deps.notifier.notify({
        runId,
        status: "failed",
        message: String(err),
        chatId,
        requesterId,
        ticketKey: ticketUrl.split("/").pop(),
        ticketUrl,
      });
    });

  return runId;
}
