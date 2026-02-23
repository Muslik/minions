import type { JiraIssue, RunContext, WorkerProfile } from "../../domain/types.js";
import type { AgentRole } from "../../services/tools.js";

export interface NodeDeps {
  jira: {
    fetchIssue(url: string): Promise<JiraIssue>;
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
  };
  git: {
    ensureMirror(url: string, dir: string): string;
    addWorktree(mirror: string, branch: string, dir: string): string;
    removeWorktree(path: string): void;
    finalizeAndPush(path: string, branch: string, squash?: boolean): void;
  };
  agent: {
    runAgent(
      role: AgentRole,
      worktreePath: string,
      ctx: RunContext,
      extra?: Record<string, string>
    ): Promise<string>;
  };
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
  };
  notifier: {
    notify(p: {
      runId: string;
      status: string;
      message: string;
      data?: unknown;
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
  config: {
    storage: {
      reposDir: string;
      workspacesDir: string;
      artifactsDir: string;
    };
    knowledgeRegistryPath: string;
  };
}
