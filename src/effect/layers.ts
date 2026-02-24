import { Context } from "effect";
import type { DockerService } from "../services/docker.js";
import type { JiraService } from "../services/jira.js";
import type { BitbucketService } from "../services/bitbucket.js";
import type { NotifierService } from "../services/notifier.js";
import type { AgentFactory } from "../services/agent.js";

// Git service interface mirroring the standalone functions
export interface GitServiceInterface {
  ensureMirror(url: string, dir: string): string;
  addWorktree(
    mirror: string,
    branch: string,
    dir: string,
    targetBranch?: string
  ): string;
  removeWorktree(path: string): void;
  finalizeAndPush(path: string, branch: string, squash?: boolean, targetBranch?: string): void;
}

export class DockerTag extends Context.Tag("DockerTag")<
  DockerTag,
  DockerService
>() {}

export class GitTag extends Context.Tag("GitTag")<
  GitTag,
  GitServiceInterface
>() {}

export class JiraTag extends Context.Tag("JiraTag")<
  JiraTag,
  JiraService
>() {}

export class BitbucketTag extends Context.Tag("BitbucketTag")<
  BitbucketTag,
  BitbucketService
>() {}

export class NotifierTag extends Context.Tag("NotifierTag")<
  NotifierTag,
  NotifierService
>() {}

export class AgentTag extends Context.Tag("AgentTag")<
  AgentTag,
  AgentFactory
>() {}
