import { execSync } from "child_process";
import { RunStatus } from "../../domain/types.js";
import type { RunContext } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

function getDiff(worktreePath: string, targetBranch = "main"): string {
  // First, stage any unstaged changes so they appear in diff
  try {
    execSync("git add -A", { cwd: worktreePath, stdio: ["pipe", "pipe", "pipe"] });
  } catch { /* ignore */ }

  // Use merge-base to include committed + staged/unstaged changes in one patch.
  try {
    const mergeBase = execSync(`git merge-base ${targetBranch} HEAD`, {
      cwd: worktreePath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    return execSync(`git diff ${mergeBase}`, {
      cwd: worktreePath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Fallback: committed-only diff from target branch tip.
    try {
      return execSync(`git diff ${targetBranch}...HEAD`, {
        cwd: worktreePath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // Last fallback: diff staged + unstaged vs HEAD.
      try {
        return execSync("git diff HEAD", {
          cwd: worktreePath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        return "";
      }
    }
  }
}
export function createReviewerNode(deps: NodeDeps) {
  return async function reviewerNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { runId, worktreePath } = state.context;

    deps.syncStatus(runId, RunStatus.REVIEWING);

    const diff = worktreePath ? getDiff(worktreePath, state.context.targetBranch) : "";

    const reviewContext: RunContext = {
      runId,
      ticketUrl: state.context.ticketUrl,
      chatId: state.context.chatId,
      requesterId: state.context.requesterId,
      jiraIssue: state.context.jiraIssue,
    };

    const onEvent = (type: string, data: unknown) => deps.emitEvent(runId, type, data);

    const output = await deps.agent.runAgent(
      "reviewer",
      worktreePath ?? "",
      reviewContext,
      { diff, plan: state.plan ?? "" },
      onEvent
    );

    const approvedMatch = /\bAPPROVED\b/.test(output);
    const rejectedMatch = output.match(/\bREJECTED:\s*(.+)/s);

    if (approvedMatch) {
      return {
        status: RunStatus.FINALIZING,
        reviewIterations: 1,
        error: undefined,
      };
    }

    const feedback = rejectedMatch ? rejectedMatch[1]?.trim() ?? output : output;
    return {
      reviewIterations: 1,
      error: feedback,
    };
  };
}
