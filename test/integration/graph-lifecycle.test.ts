import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { RunStatus } from "../../src/domain/types.ts";
import type { CodingState } from "../../src/domain/state.ts";
import type { NodeDeps } from "../../src/graph/nodes/deps.ts";

import { createHydrateNode } from "../../src/graph/nodes/hydrate.ts";
import { createArchitectNode } from "../../src/graph/nodes/architect.ts";
import { createCoderNode } from "../../src/graph/nodes/coder.ts";
import { createValidateNode } from "../../src/graph/nodes/validate.ts";
import { createReviewerNode } from "../../src/graph/nodes/reviewer.ts";
import { createFinalizeNode } from "../../src/graph/nodes/finalize.ts";
import { createCleanupNode } from "../../src/graph/nodes/cleanup.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<CodingState> = {}): CodingState {
  return {
    runId: "run-1",
    status: RunStatus.RECEIVED,
    payload: {
      ticketUrl: "https://jira.example.com/browse/TEST-1",
      chatId: "chat-1",
      requesterId: "user-1",
    },
    context: {
      runId: "run-1",
      ticketUrl: "https://jira.example.com/browse/TEST-1",
      chatId: "chat-1",
      requesterId: "user-1",
    },
    plan: undefined,
    codeIterations: 0,
    reviewIterations: 0,
    error: undefined,
    escalationReason: undefined,
    resumeAction: undefined,
    resumeComment: undefined,
    questions: undefined,
    answers: undefined,
    ciStatus: undefined,
    ciBuildUrl: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock NodeDeps
// ---------------------------------------------------------------------------

let removeWorktreeCalled = false;
let removeWorktreePath: string | undefined;
const addWorktreeCalls: Array<{
  mirror: string;
  branch: string;
  dir: string;
  targetBranch?: string;
}> = [];

const mockDeps: NodeDeps = {
  jira: {
    fetchIssue: async () => ({
      key: "TEST-1",
      summary: "Fix bug",
      description: "Bug description",
      components: ["frontend"],
      labels: [],
      links: [],
      figmaLinks: [],
    }),
    transitionIssue: async () => {},
  },
  knowledge: {
    resolveRepo: () => ({
      repoUrl: "ssh://git@bb.com/proj/repo.git",
      targetBranch: "develop",
      projectKey: "PROJ",
      repoSlug: "repo",
    }),
  },
  git: {
    ensureMirror: (_url, _dir) => "/tmp/mirror",
    addWorktree: (mirror, branch, dir, targetBranch) => {
      addWorktreeCalls.push({ mirror, branch, dir, targetBranch });
      return "/tmp/worktree";
    },
    removeWorktree: (path) => {
      removeWorktreeCalled = true;
      removeWorktreePath = path;
    },
    finalizeAndPush: (_path, _branch, _squash) => {},
    getHeadCommit: (_path) => "abc123def456",
  },
  agent: {
    runAgent: async (role, _worktreePath, _ctx, _extra, _onEvent) => {
      if (role === "clarify") return "[]";
      if (role === "architect") return "# Plan\n- Fix the bug";
      if (role === "coder") return "Code written";
      if (role === "reviewer") return "APPROVED";
      return "";
    },
  },
  syncStatus: (_runId, _status) => {},
  syncPlan: (_runId, _plan) => {},
  emitEvent: (_runId, _type, _data) => {},
  docker: {
    withContainer: async (_profile, _binds, fn) => fn({} as unknown),
    exec: async () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
  },
  bitbucket: {
    createPR: async () => "https://bb.com/pr/1",
    getCommitBuildStatus: async () => [],
  },
  notifier: {
    notify: async (_p: Record<string, unknown>) => {},
  },
  artifacts: {
    saveArtifact: (_dir, _runId, _name, _content) => {},
  },
  vpn: {
    up: async () => {},
    down: async () => {},
  },
  config: {
    storage: {
      reposDir: "/tmp/repos",
      workspacesDir: "/tmp/ws",
      artifactsDir: "/tmp/art",
    },
    knowledgeRegistryPath: "",
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("graph-lifecycle: individual node isolation", () => {
  describe("hydrate node", () => {
    it("returns PLANNING status with filled context when given a ticketUrl", async () => {
      addWorktreeCalls.length = 0;
      const node = createHydrateNode(mockDeps);
      const state = makeState();

      const result = await node(state);

      assert.equal(result.status, RunStatus.PLANNING);
      assert.ok(result.context, "context should be present");
      assert.equal(result.context!.jiraIssue?.key, "TEST-1");
      assert.equal(result.context!.jiraIssue?.summary, "Fix bug");
      assert.equal(result.context!.repoUrl, "ssh://git@bb.com/proj/repo.git");
      assert.equal(result.context!.targetBranch, "develop");
      assert.equal(result.context!.worktreePath, "/tmp/worktree");
      assert.equal(result.context!.mirrorPath, "/tmp/mirror");
      assert.equal(result.context!.projectKey, "PROJ");
      assert.equal(result.context!.repoSlug, "repo");
      assert.deepEqual(result.context!.figmaLinks, []);
      assert.equal(addWorktreeCalls.at(-1)?.targetBranch, "develop");
    });

    it("returns ESCALATED when knowledge cannot resolve a repo", async () => {
      const depsNoRepo: NodeDeps = {
        ...mockDeps,
        knowledge: { resolveRepo: () => null },
      };
      const node = createHydrateNode(depsNoRepo);
      const state = makeState();

      const result = await node(state);

      assert.equal(result.status, RunStatus.ESCALATED);
      assert.ok(result.escalationReason);
    });
  });

  describe("architect node", () => {
    it("returns AWAITING_APPROVAL status with plan", async () => {
      const node = createArchitectNode(mockDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
          worktreePath: "/tmp/worktree",
        },
      });

      const result = await node(state);

      assert.equal(result.status, RunStatus.AWAITING_APPROVAL);
      assert.equal(result.plan, "# Plan\n- Fix the bug");
    });
  });

  describe("coder node", () => {
    it("returns VALIDATING status with incremented codeIterations", async () => {
      const node = createCoderNode(mockDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
          worktreePath: "/tmp/worktree",
        },
        plan: "# Plan\n- Fix the bug",
        codeIterations: 0,
      });

      const result = await node(state);

      assert.equal(result.status, RunStatus.VALIDATING);
      // The node returns 1 as the delta (the reducer adds it to the current value)
      assert.equal(result.codeIterations, 1);
      assert.equal(result.error, undefined);
    });
  });

  describe("validate node", () => {
    it("returns REVIEWING when exitCode is 0", async () => {
      const node = createValidateNode(mockDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
          worktreePath: "/tmp/worktree",
          validationCommands: ["npm test"],
        },
      });

      const result = await node(state);

      assert.equal(result.status, RunStatus.REVIEWING);
      assert.equal(result.error, undefined);
    });

    it("returns an error when exitCode is non-zero", async () => {
      const failDeps: NodeDeps = {
        ...mockDeps,
        docker: {
          withContainer: async (_p, _b, fn) => fn({} as unknown),
          exec: async () => ({ stdout: "FAIL", stderr: "error details", exitCode: 1 }),
        },
      };
      const node = createValidateNode(failDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
          worktreePath: "/tmp/worktree",
          validationCommands: ["npm test"],
        },
      });

      const result = await node(state);

      // validate node does NOT set status when there are failures; only sets error
      assert.equal(result.status, undefined);
      assert.ok(result.error, "error should be set on validation failure");
      assert.ok(result.error!.includes("npm test"), "error should contain the failed command");
    });

    it("returns REVIEWING with no error when validationCommands is empty", async () => {
      const node = createValidateNode(mockDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
          worktreePath: "/tmp/worktree",
          validationCommands: [],
        },
      });

      const result = await node(state);

      assert.equal(result.status, RunStatus.REVIEWING);
      assert.equal(result.error, undefined);
    });
  });

  describe("reviewer node", () => {
    it("returns FINALIZING when worker output contains APPROVED", async () => {
      const node = createReviewerNode(mockDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
          worktreePath: "/tmp/worktree",
        },
        plan: "# Plan\n- Fix the bug",
      });

      const result = await node(state);

      assert.equal(result.status, RunStatus.FINALIZING);
      assert.equal(result.reviewIterations, 1);
      assert.equal(result.error, undefined);
    });

    it("returns an error when agent output contains REJECTED: reason", async () => {
      const rejectedDeps: NodeDeps = {
        ...mockDeps,
        agent: {
          runAgent: async () => "REJECTED: Missing error handling",
        },
      };
      const node = createReviewerNode(rejectedDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
          worktreePath: "/tmp/worktree",
        },
        plan: "# Plan\n- Fix the bug",
      });

      const result = await node(state);

      assert.equal(result.status, undefined);
      assert.equal(result.reviewIterations, 1);
      assert.ok(result.error, "error should be set on rejection");
      assert.equal(result.error, "Missing error handling");
    });
  });

  describe("finalize node", () => {
    it("returns WAITING_FOR_CI status with prUrl and commitHash in context", async () => {
      const node = createFinalizeNode(mockDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
          worktreePath: "/tmp/worktree",
          targetBranch: "develop",
          projectKey: "PROJ",
          repoSlug: "repo",
          jiraIssue: {
            key: "TEST-1",
            summary: "Fix bug",
            description: "Bug description",
            components: ["frontend"],
            labels: [],
            links: [],
            figmaLinks: [],
          },
        },
        plan: "# Plan\n- Fix the bug",
      });

      const result = await node(state);

      assert.equal(result.status, RunStatus.WAITING_FOR_CI);
      assert.ok(result.context, "context should be present");
      assert.equal(result.context!.prUrl, "https://bb.com/pr/1");
      assert.equal(result.context!.commitHash, "abc123def456");
      assert.equal(result.context!.planMarkdown, "# Plan\n- Fix the bug");
    });
  });

  describe("cleanup node", () => {
    it("returns DONE and calls removeWorktree", async () => {
      removeWorktreeCalled = false;
      removeWorktreePath = undefined;

      const node = createCleanupNode(mockDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
          worktreePath: "/tmp/worktree",
          prUrl: "https://bb.com/pr/1",
        },
      });

      const result = await node(state);

      assert.equal(result.status, RunStatus.DONE);
      assert.equal(removeWorktreeCalled, true);
      assert.equal(removeWorktreePath, "/tmp/worktree");
    });

    it("returns DONE even when worktreePath is absent", async () => {
      removeWorktreeCalled = false;

      const node = createCleanupNode(mockDeps);
      const state = makeState({
        context: {
          runId: "run-1",
          ticketUrl: "https://jira.example.com/browse/TEST-1",
          chatId: "chat-1",
          requesterId: "user-1",
        },
      });

      const result = await node(state);

      assert.equal(result.status, RunStatus.DONE);
      assert.equal(removeWorktreeCalled, false);
    });
  });
});
