import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveRepo, resolveValidationCommands } from "../src/services/knowledge.ts";
import type { KnowledgeRegistry } from "../src/services/knowledge.ts";
import type { JiraIssue } from "../src/domain/types.ts";

function makeIssue(
  key: string,
  description: string = "",
  components: string[] = [],
  labels: string[] = []
): JiraIssue {
  return {
    key,
    summary: "Test issue",
    description,
    components,
    labels,
    links: [],
    figmaLinks: [],
  };
}

const BASE_REGISTRY: KnowledgeRegistry = {
  bitbucket: {
    project: "MYORG",
    baseCloneUrl: "https://git.example.com/scm/myorg",
  },
  git: {
    branchFormat: "{{TICKET_KEY}}/{{SHORT_DESCRIPTION}}",
    commitFormat: "{{TICKET_KEY}}: {{SUMMARY}}",
    squashCommitFormat: "{{TICKET_KEY}}: {{SUMMARY}}",
  },
  repos: {
    "back-components": {
      description: "Backend components monorepo",
      branch: "main",
    },
    "front-app": {
      description: "Frontend application",
      branch: "develop",
    },
    "infra-repo": {
      branch: "main",
    },
  },
  projects: {
    AVIA: { default: "back-components" },
    FRONT: { default: "front-app" },
  },
};

describe("resolveRepo — knowledge scoping", () => {
  it("resolves repo by project default", () => {
    const issue = makeIssue("AVIA-123");
    const result = resolveRepo(BASE_REGISTRY, issue);

    assert.ok(result !== null);
    assert.equal(result.repoUrl, "https://git.example.com/scm/myorg/back-components.git");
    assert.equal(result.targetBranch, "main");
    assert.equal(result.projectKey, "MYORG");
    assert.equal(result.repoSlug, "back-components");
    assert.equal(result.repoDescription, "Backend components monorepo");
  });

  it("resolves repo by packageScope in description", () => {
    const registry: KnowledgeRegistry = {
      ...BASE_REGISTRY,
      packageScopes: {
        "@ott/": ["front-app"],
        "@ott/crypto-trips": ["back-components"],
      },
    };

    // Description contains @ott/crypto-trips — should resolve to back-components
    const issue = makeIssue("AVIA-200", "Uses package @ott/crypto-trips for booking");
    const result = resolveRepo(registry, issue);

    assert.ok(result !== null);
    assert.equal(result.repoSlug, "back-components");
    assert.equal(result.targetBranch, "main");
  });

  it("specific scope wins over generic scope (@ott/crypto-trips beats @ott/)", () => {
    const registry: KnowledgeRegistry = {
      ...BASE_REGISTRY,
      packageScopes: {
        "@ott/": ["front-app"],
        "@ott/crypto-trips": ["back-components"],
      },
    };

    // Description contains both @ott/ (implicit in @ott/crypto-trips) and the specific scope
    const issue = makeIssue("AVIA-300", "Depends on @ott/crypto-trips component");
    const result = resolveRepo(registry, issue);

    assert.ok(result !== null);
    // The longer/more-specific scope @ott/crypto-trips should win over @ott/
    assert.equal(result.repoSlug, "back-components");
  });

  it("returns null when project not found in registry", () => {
    const issue = makeIssue("UNKNOWN-1");
    const result = resolveRepo(BASE_REGISTRY, issue);

    assert.equal(result, null);
  });

  it("returns null for an empty-projects registry", () => {
    const registry: KnowledgeRegistry = {
      ...BASE_REGISTRY,
      projects: {},
    };
    const result = resolveRepo(registry, makeIssue("AVIA-1"));
    assert.equal(result, null);
  });

  it("additionalRepos populated when scope matches multiple repos", () => {
    const registry: KnowledgeRegistry = {
      ...BASE_REGISTRY,
      packageScopes: {
        "@ott/shared": ["back-components", "front-app"],
      },
    };

    const issue = makeIssue("AVIA-400", "Refactor @ott/shared utilities");
    const result = resolveRepo(registry, issue);

    assert.ok(result !== null);
    assert.equal(result.repoSlug, "back-components");
    assert.ok(Array.isArray(result.additionalRepos));
    assert.ok(result.additionalRepos!.includes("front-app"));
    assert.equal(result.additionalRepos!.length, 1);
  });

  it("repoDescription populated from repos entry", () => {
    const issue = makeIssue("FRONT-10");
    const result = resolveRepo(BASE_REGISTRY, issue);

    assert.ok(result !== null);
    assert.equal(result.repoSlug, "front-app");
    assert.equal(result.repoDescription, "Frontend application");
  });

  it("repoDescription is undefined when repo has no description field", () => {
    const registry: KnowledgeRegistry = {
      ...BASE_REGISTRY,
      projects: {
        INFRA: { default: "infra-repo" },
      },
    };

    const issue = makeIssue("INFRA-5");
    const result = resolveRepo(registry, issue);

    assert.ok(result !== null);
    assert.equal(result.repoSlug, "infra-repo");
    assert.equal(result.repoDescription, undefined);
  });

  it("falls back to project default when description has no matching scope", () => {
    const registry: KnowledgeRegistry = {
      ...BASE_REGISTRY,
      packageScopes: {
        "@ott/crypto-trips": ["back-components"],
      },
    };

    // Description does not mention any scope
    const issue = makeIssue("FRONT-20", "General frontend improvements");
    const result = resolveRepo(registry, issue);

    assert.ok(result !== null);
    assert.equal(result.repoSlug, "front-app");
  });

  it("additionalRepos is undefined when scope matches only the primary repo", () => {
    const registry: KnowledgeRegistry = {
      ...BASE_REGISTRY,
      packageScopes: {
        "@ott/crypto-trips": ["back-components"],
      },
    };

    const issue = makeIssue("AVIA-500", "Fix @ott/crypto-trips bug");
    const result = resolveRepo(registry, issue);

    assert.ok(result !== null);
    assert.equal(result.repoSlug, "back-components");
    assert.equal(result.additionalRepos, undefined);
  });
});

describe("resolveValidationCommands", () => {
  it("returns .minions validation commands when provided", () => {
    const result = resolveValidationCommands("front-avia", {
      validation: { commands: ["pnpm run custom:lint", "pnpm run custom:test"] },
    });

    assert.deepEqual(result, ["pnpm run custom:lint", "pnpm run custom:test"]);
  });

  it("falls back to front-avia defaults when repo config has no commands", () => {
    const result = resolveValidationCommands("front-avia", null);

    assert.deepEqual(result, [
      "pnpm run lint:eslint",
      "pnpm run lint:prettier",
      "pnpm run lint:stylelint",
      "pnpm run lint:circular",
      "pnpm run typecheck",
      "pnpm run dicts",
      "pnpm run test",
    ]);
  });

  it("returns empty list for unknown repo without config", () => {
    const result = resolveValidationCommands("unknown-repo", null);
    assert.deepEqual(result, []);
  });

  it("trims and filters empty commands from repo config", () => {
    const result = resolveValidationCommands("front-avia", {
      validation: { commands: ["  pnpm run lint:eslint ", "", "   "] },
    });

    assert.deepEqual(result, ["pnpm run lint:eslint"]);
  });
});
