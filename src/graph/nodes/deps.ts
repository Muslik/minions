import type { JiraIssue, RunContext, WorkerProfile, BuildStatus } from "../../domain/types.js";
import type { AgentRole } from "../../services/tools.js";

export interface NodeDeps {
  jira: {
    fetchIssue(url: string): Promise<JiraIssue>;
    transitionIssue(issueKey: string, transitionName: string): Promise<void>;
  };
  knowledge: {
    resolveRepo(issue: JiraIssue): {
      repoUrl: string;
      targetBranch: string;
      projectKey: string;
      repoSlug: string;
      repoDescription?: string;
      additionalRepos?: string[];
    } | null;
    formatBranch(ticketKey: string, summary: string): string;
  };
  git: {
    ensureMirror(url: string, dir: string): string;
    addWorktree(
      mirror: string,
      branch: string,
      dir: string,
      targetBranch?: string
    ): string;
    removeWorktree(path: string): void;
    finalizeAndPush(path: string, branch: string, squash?: boolean, targetBranch?: string): void;
    getHeadCommit(worktreePath: string): string;
  };
  agent: {
    runAgent(
      role: AgentRole,
      worktreePath: string,
      ctx: RunContext,
      extra?: Record<string, string>,
      onEvent?: (type: string, data: unknown) => void
    ): Promise<string>;
  };
  emitEvent(runId: string, type: string, data: unknown): void;
  syncStatus(runId: string, status: string): void;
  syncPlan(runId: string, plan: string): void;
  docker: {
    withContainer<T>(
      profile: WorkerProfile,
      binds: string[],
      fn: (c: unknown) => Promise<T>,
      env?: string[]
    ): Promise<T>;
    exec(
      c: unknown,
      cmd: string[]
    ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  };
  bitbucket: {
    createPR(p: {
      projectKey: string;
      repoSlug: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string;
    }): Promise<string>;
    getCommitBuildStatus(commitHash: string): Promise<BuildStatus[]>;
  };
  notifier: {
    notify(p: {
      runId: string;
      status: string;
      message: string;
      chatId: string;
      requesterId: string;
      ticketKey?: string;
      ticketUrl?: string;
      data?: unknown;
      actions?: { label: string; endpoint: string; body: Record<string, string> }[];
    }): Promise<void>;
  };
  artifacts: {
    saveArtifact(dir: string, runId: string, name: string, content: string): void;
  };
  confluence?: {
    fetchPage(url: string): Promise<{ title: string; content: string } | null>;
  };
  loop?: {
    fetchThread(url: string): Promise<string | null>;
  };
  vpn: {
    up(): Promise<void>;
    down(): Promise<void>;
  };
  config: {
    storage: {
      reposDir: string;
      workspacesDir: string;
      artifactsDir: string;
    };
    knowledgeRegistryPath: string;
  };
}
