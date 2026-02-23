import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

export function createFinalizeNode(deps: NodeDeps) {
  return async function finalizeNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const {
      runId,
      worktreePath,
      targetBranch,
      jiraIssue,
      projectKey,
      repoSlug,
    } = state.context;

    deps.syncStatus(runId, RunStatus.FINALIZING);

    const branch = `minions/${jiraIssue?.key ?? state.runId}`;

    deps.git.finalizeAndPush(worktreePath ?? "", branch, true, targetBranch ?? "main");

    const commitHash = deps.git.getHeadCommit(worktreePath ?? "");

    const prTitle = jiraIssue
      ? `${jiraIssue.key}: ${jiraIssue.summary}`
      : branch;

    const prUrl = await deps.bitbucket.createPR({
      projectKey: projectKey ?? "",
      repoSlug: repoSlug ?? "",
      sourceBranch: branch,
      targetBranch: targetBranch ?? "main",
      title: prTitle,
      description: state.plan ?? "",
    });

    return {
      status: RunStatus.WAITING_FOR_CI,
      context: {
        ...state.context,
        planMarkdown: state.plan,
        prUrl,
        commitHash,
      },
    };
  };
}
