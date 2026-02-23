import path from "path";
import type { OrchestratorConfig } from "../config/schema.js";
import type { NodeDeps } from "../graph/nodes/deps.js";
import { DockerService } from "../services/docker.js";
import { JiraService } from "../services/jira.js";
import { BitbucketService } from "../services/bitbucket.js";
import { NotifierService } from "../services/notifier.js";
import { TelegramChannel } from "../services/telegram.js";
import { OAuthTokenProvider } from "../services/auth.js";
import { AgentFactory } from "../services/agent.js";
import { VpnService } from "../services/vpn.js";
import { ConfluenceService } from "../services/confluence.js";
import { LoopService } from "../services/loop.js";
import {
  ensureMirror,
  addWorktree,
  removeWorktree,
  finalizeAndPush,
  getHeadCommit,
} from "../services/git.js";
import { loadRegistry, resolveRepo } from "../services/knowledge.js";
import { saveArtifact } from "../services/artifacts.js";

export function buildRuntime(config: OrchestratorConfig): {
  deps: NodeDeps;
  cleanup: () => void;
} {
  const promptsDir = path.resolve(process.cwd(), config.storage.promptsDir);
  const knowledgeRegistryPath = path.resolve(
    process.cwd(),
    config.storage.knowledgeRegistryPath
  );

  const docker = new DockerService(config.docker);
  const jira = new JiraService(config.jira);
  const bitbucket = new BitbucketService(config.bitbucket);
  const telegramChannel = new TelegramChannel(config.notifier.telegram.botToken, config.notifier.telegram.chatId);
  const notifier = new NotifierService([telegramChannel]);

  const authDir = config.agent.authDir.startsWith("~")
    ? config.agent.authDir.replace("~", process.env["HOME"] ?? "/root")
    : config.agent.authDir;

  const tokenProvider = new OAuthTokenProvider(authDir);
  const agentFactory = new AgentFactory({
    model: config.agent.model,
    baseUrl: config.agent.baseUrl,
    tokenProvider,
    promptsDir,
  });

  const vpn = new VpnService();

  const registry = loadRegistry(knowledgeRegistryPath);

  const confluenceService = config.confluence
    ? new ConfluenceService(config.confluence.baseUrl, config.confluence.token)
    : undefined;

  const loopService = config.loop
    ? new LoopService(config.loop.baseUrl, config.loop.token)
    : undefined;

  const deps: NodeDeps = {
    jira: {
      fetchIssue: (url) => jira.fetchIssue(url),
    transitionIssue: (key, name) => jira.transitionIssue(key, name),
    },
    knowledge: {
      resolveRepo: (issue) => resolveRepo(registry, issue),
    },
    git: {
      ensureMirror: (url, dir) => ensureMirror(url, dir),
      addWorktree: (mirror, branch, dir, targetBranch) =>
        addWorktree(mirror, branch, dir, targetBranch),
      removeWorktree: (path) => removeWorktree(path),
      finalizeAndPush: (path, branch, squash) =>
        finalizeAndPush(path, branch, squash),
      getHeadCommit: (worktreePath) => getHeadCommit(worktreePath),
    },
    agent: {
      runAgent: (role, worktreePath, ctx, extra) =>
        agentFactory.runAgent(role, worktreePath, ctx, extra),
    },
    docker: {
      withContainer: (profile, binds, fn, env) =>
        docker.withContainer(profile, binds, fn, env),
      exec: (c, cmd) =>
        docker.exec(c as Parameters<typeof docker.exec>[0], cmd),
    },
    bitbucket: {
      createPR: (p) => bitbucket.createPR(p),
      getCommitBuildStatus: (hash) => bitbucket.getCommitBuildStatus(hash),
    },
    notifier: {
      notify: (p) => notifier.notify(p),
    },
    artifacts: {
      saveArtifact: (dir, runId, name, content) =>
        saveArtifact(dir, runId, name, content),
    },
    ...(confluenceService
      ? {
          confluence: {
            fetchPage: (url) => confluenceService.fetchPage(url),
          },
        }
      : {}),
    ...(loopService
      ? {
          loop: {
            fetchThread: (url) => loopService.fetchThread(url),
          },
        }
      : {}),
    vpn: {
      up: () => vpn.up(),
      down: () => vpn.down(),
    },
    config: {
      storage: {
        reposDir: config.storage.reposDir,
        workspacesDir: config.storage.workspacesDir,
        artifactsDir: config.storage.artifactsDir,
      },
      knowledgeRegistryPath,
    },
  };

  const cleanup = () => {
    // No long-lived resources to clean up currently.
  };

  return { deps, cleanup };
}
