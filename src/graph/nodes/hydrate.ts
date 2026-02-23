import { RunStatus } from "../../domain/types.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";
import { loadRepoConfig } from "../../services/knowledge.js";

const CONFLUENCE_RE = /https?:\/\/[^\s"')]*(?:\/wiki\/|\/confluence\/|[?&]pageId=)[^\s"')]+/g;
const LOOP_RE = /https?:\/\/[^\s"')]*(?:onetwotrip\.loop\.ru|\/pl\/)[^\s"')]+/g;

export function createHydrateNode(deps: NodeDeps) {
  return async function hydrateNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { ticketUrl, chatId, requesterId } = state.payload;
    const runId = state.runId;

    await deps.vpn.up();

    const jiraIssue = await deps.jira.fetchIssue(ticketUrl);

    await deps.jira.transitionIssue(jiraIssue.key, "In Progress").catch((err) => {
      console.warn(`[hydrate] Failed to transition ${jiraIssue.key} to In Progress:`, err);
    });

    const repoMatch = deps.knowledge.resolveRepo(jiraIssue);
    if (!repoMatch) {
      return {
        status: RunStatus.ESCALATED,
        escalationReason: `Could not resolve repo for issue ${jiraIssue.key}`,
      };
    }

    const { repoUrl, targetBranch, projectKey, repoSlug, repoDescription, additionalRepos } = repoMatch;
    const { reposDir, workspacesDir } = deps.config.storage;

    const mirrorPath = deps.git.ensureMirror(repoUrl, reposDir);
    const branch = `minions/${jiraIssue.key}`;
    const worktreePath = deps.git.addWorktree(
      mirrorPath,
      branch,
      workspacesDir,
      targetBranch
    );

    // Read per-repo .minions.yaml (lives inside the repo)
    const repoConfig = loadRepoConfig(worktreePath);
    const validationCommands = repoConfig?.validation?.commands ?? [];
    const repoConventions = repoConfig?.conventions;

    // Collect text to search for external links
    const searchText = [jiraIssue.description, ...jiraIssue.links].join(" ");
    const confluenceUrls = [...new Set(searchText.match(CONFLUENCE_RE) ?? [])];
    const loopUrls = [...new Set(searchText.match(LOOP_RE) ?? [])];

    const confluencePages: Array<{ title: string; content: string }> = [];
    if (deps.confluence && confluenceUrls.length > 0) {
      const results = await Promise.all(
        confluenceUrls.map((url) => deps.confluence!.fetchPage(url))
      );
      for (const page of results) {
        if (page) confluencePages.push(page);
      }
    }

    const loopThreads: string[] = [];
    if (deps.loop && loopUrls.length > 0) {
      const results = await Promise.all(
        loopUrls.map((url) => deps.loop!.fetchThread(url))
      );
      for (const thread of results) {
        if (thread) loopThreads.push(thread);
      }
    }

    await deps.notifier.notify({
      runId,
      status: "started",
      message: `Задача ${jiraIssue.key} взята в работу`,
      chatId,
      requesterId,
      ticketKey: jiraIssue.key,
      ticketUrl,
      actions: [
        { label: "❌ Отменить", endpoint: `/api/v1/runs/${runId}/cancel`, body: {} },
      ],
    });

    return {
      status: RunStatus.PLANNING,
      context: {
        ...state.context,
        runId,
        ticketUrl,
        chatId,
        requesterId,
        jiraIssue,
        repoUrl,
        targetBranch,
        worktreePath,
        mirrorPath,
        validationCommands,
        figmaLinks: jiraIssue.figmaLinks,
        projectKey,
        repoSlug,
        confluencePages,
        loopThreads,
        repoDescription,
        additionalRepos,
        repoConventions,
      },
    };
  };
}
