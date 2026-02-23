import { interrupt } from "@langchain/langgraph";
import { RunStatus } from "../../domain/types.js";
import type { ResumeAction } from "../../domain/types.js";
import { CI_POLL_INTERVAL_MS, CI_POLL_MAX_ATTEMPTS } from "../../domain/constants.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

interface CiResumePayload {
  action: ResumeAction;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAwaitCiNode(deps: NodeDeps) {
  return async function awaitCiNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { commitHash, runId, chatId, requesterId, ticketUrl, jiraIssue } =
      state.context;
    const ticketKey = jiraIssue?.key;

    if (!commitHash) {
      return { status: RunStatus.DONE, ciStatus: "SUCCESSFUL" };
    }

    await deps.notifier.notify({
      runId,
      status: "waiting_for_ci",
      message: "Waiting for CI build status...",
      chatId,
      requesterId,
      ticketKey,
      ticketUrl,
    });

    let lastBuildUrl: string | undefined;

    for (let attempt = 0; attempt < CI_POLL_MAX_ATTEMPTS; attempt++) {
      const builds = await deps.bitbucket.getCommitBuildStatus(commitHash);

      if (builds.length === 0) {
        await sleep(CI_POLL_INTERVAL_MS);
        continue;
      }

      lastBuildUrl = builds[0]?.url;

      const hasInProgress = builds.some((b) => b.state === "INPROGRESS");
      const hasFailed = builds.some((b) => b.state === "FAILED");
      const allSuccessful =
        builds.length > 0 && builds.every((b) => b.state === "SUCCESSFUL");

      if (allSuccessful) {
        await deps.notifier.notify({
          runId,
          status: "ci_passed",
          message: "CI passed",
          chatId,
          requesterId,
          ticketKey,
          ticketUrl,
        });
        return {
          status: RunStatus.DONE,
          ciStatus: "SUCCESSFUL",
          ciBuildUrl: lastBuildUrl,
        };
      }

      if (hasFailed) {
        const failedBuild = builds.find((b) => b.state === "FAILED");
        lastBuildUrl = failedBuild?.url ?? lastBuildUrl;
        break;
      }

      if (hasInProgress) {
        await sleep(CI_POLL_INTERVAL_MS);
        continue;
      }

      await sleep(CI_POLL_INTERVAL_MS);
    }

    // Failure or timeout — notify and interrupt for human decision
    const failMsg = lastBuildUrl
      ? `CI failed: ${lastBuildUrl}`
      : "CI timed out waiting for build status";

    await deps.notifier.notify({
      runId,
      status: "ci_failed",
      message: failMsg,
      chatId,
      requesterId,
      ticketKey,
      ticketUrl,
      actions: [
        {
          label: "🔄 Повторить",
          endpoint: `/api/v1/runs/${runId}/resume`,
          body: { action: "retry" },
        },
        {
          label: "✅ Закрыть",
          endpoint: `/api/v1/runs/${runId}/resume`,
          body: { action: "close" },
        },
      ],
    });

    const resume = interrupt<{ ciStatus: string; buildUrl?: string }, CiResumePayload>({
      ciStatus: "FAILED",
      buildUrl: lastBuildUrl,
    });

    return {
      resumeAction: resume.action,
      ciStatus: "FAILED",
      ciBuildUrl: lastBuildUrl,
    };
  };
}
