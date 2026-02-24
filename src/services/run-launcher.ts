import { RunStatus } from "../domain/types.js";
import type { RunContext } from "../domain/types.js";
import type { RunStore } from "../store/runs.js";
import type { NodeDeps } from "../graph/nodes/deps.js";
import type { CompiledGraph } from "../api/server.js";
import type { CodingState } from "../domain/state.js";

export interface LaunchRunParams {
  ticketUrl: string;
  chatId: string;
  requesterId: string;
}

export interface LaunchRunSeed {
  plan?: string;
  resumeAction?: CodingState["resumeAction"];
  resumeComment?: string;
  contextPatch?: Partial<RunContext>;
}

export function launchRun(
  params: LaunchRunParams,
  runStore: RunStore,
  graph: CompiledGraph,
  deps: NodeDeps,
  seed?: LaunchRunSeed
): string {
  const { ticketUrl, chatId, requesterId } = params;
  const runId = runStore.create({ ticketUrl, chatId, requesterId });

  const initialContext: RunContext = {
    ...(seed?.contextPatch ?? {}),
    runId,
    ticketUrl,
    chatId,
    requesterId,
  };
  runStore.updateContext(runId, initialContext);
  if (seed?.plan) {
    runStore.updatePlan(runId, seed.plan);
  }

  const initialState: Record<string, unknown> = {
    runId,
    payload: { ticketUrl, chatId, requesterId },
    context: initialContext,
  };
  if (seed?.plan) initialState["plan"] = seed.plan;
  if (seed?.resumeAction) initialState["resumeAction"] = seed.resumeAction;
  if (seed?.resumeComment) initialState["resumeComment"] = seed.resumeComment;

  graph
    .invoke(initialState, { configurable: { thread_id: runId } })
    .then((finalState) => {
      runStore.updateStatus(runId, finalState.status);
      if (finalState.context) {
        runStore.updateContext(runId, finalState.context);
      }
      if (finalState.plan) {
        runStore.updatePlan(runId, finalState.plan);
      }
      if (finalState.questions) {
        runStore.updateQuestions(runId, finalState.questions);
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
