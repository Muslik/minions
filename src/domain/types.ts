export const RunStatus = {
  RECEIVED: "RECEIVED",
  HYDRATING: "HYDRATING",
  CLARIFYING: "CLARIFYING",
  PLANNING: "PLANNING",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  CODING: "CODING",
  VALIDATING: "VALIDATING",
  REVIEWING: "REVIEWING",
  FINALIZING: "FINALIZING",
  WAITING_FOR_CI: "WAITING_FOR_CI",
  DONE: "DONE",
  FAILED: "FAILED",
  ESCALATED: "ESCALATED",
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export type ResumeAction = "approve" | "revise" | "cancel" | "retry" | "close" | "answer";

export interface BuildStatus {
  state: "SUCCESSFUL" | "FAILED" | "INPROGRESS";
  name: string;
  url: string;
  dateAdded: number;
}

export interface RunPayload {
  ticketUrl: string;
  chatId: string;
  requesterId: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  components: string[];
  labels: string[];
  links: string[];
  figmaLinks: string[];
}

export interface RunContext {
  runId: string;
  ticketUrl: string;
  chatId: string;
  requesterId: string;
  jiraIssue?: JiraIssue;
  repoUrl?: string;
  targetBranch?: string;
  branchName?: string;
  worktreePath?: string;
  mirrorPath?: string;
  planMarkdown?: string;
  validationCommands?: string[];
  figmaLinks?: string[];
  projectKey?: string;
  repoSlug?: string;
  prUrl?: string;
  commitHash?: string;
  confluencePages?: Array<{ title: string; content: string }>;
  loopThreads?: string[];
  repoDescription?: string;
  additionalRepos?: string[];
  repoConventions?: string;
}

export interface WorkerProfile {
  role: string;
  cpu: number;
  memory: string;
  network: "none" | "bridge";
  readOnly: boolean;
  timeoutMs: number;
}
