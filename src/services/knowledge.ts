import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { JiraIssue } from "../domain/types.js";

// ─── Registry types ───

export interface RepoEntry {
  description?: string;
  branch: string;
}

export interface GitConventions {
  branchFormat: string;
  commitFormat: string;
  squashCommitFormat: string;
}

export interface KnowledgeRegistry {
  bitbucket: { project: string; baseCloneUrl: string };
  git: GitConventions;
  packageScopes?: Record<string, string[]>;
  repos: Record<string, RepoEntry>;
  projects: Record<string, { default: string }>;
}

export type RepoMatch = {
  repoUrl: string;
  targetBranch: string;
  projectKey: string;
  repoSlug: string;
  repoDescription?: string;
  additionalRepos?: string[];
};

// ─── Per-repo config (.minions.yaml) ───

export interface RepoConfig {
  description?: string;
  validation?: { commands?: string[] };
  conventions?: string;
}

const DEFAULT_VALIDATION_COMMANDS_BY_REPO: Record<string, string[]> = {
  "front-avia": [
    "pnpm run lint:eslint",
    "pnpm run lint:prettier",
    "pnpm run lint:stylelint",
    "pnpm run lint:circular",
    "pnpm run typecheck",
    "pnpm run dicts",
    "pnpm run test",
  ],
};

// ─── Loaders ───

export function loadRegistry(path: string): KnowledgeRegistry {
  return parseYaml(readFileSync(path, "utf-8")) as KnowledgeRegistry;
}

export function loadRepoConfig(worktreePath: string): RepoConfig | null {
  const p = join(worktreePath, ".minions.yaml");
  if (!existsSync(p)) return null;
  try {
    return parseYaml(readFileSync(p, "utf-8")) as RepoConfig;
  } catch {
    return null;
  }
}

export function resolveValidationCommands(
  repoSlug: string,
  repoConfig: RepoConfig | null
): string[] {
  const fromRepo = (repoConfig?.validation?.commands ?? [])
    .map((c) => c.trim())
    .filter(Boolean);

  if (fromRepo.length > 0) return fromRepo;
  return DEFAULT_VALIDATION_COMMANDS_BY_REPO[repoSlug] ?? [];
}

// ─── Resolution ───
// Priority: specific packageScope match > project default

export function resolveRepo(
  registry: KnowledgeRegistry,
  jiraIssue: JiraIssue
): RepoMatch | null {
  const issueProject = jiraIssue.key.split("-")[0] ?? "";
  const project = registry.projects[issueProject];
  if (!project) return null;

  let slug: string | null = null;

  // 1. Specific package scope in description (e.g. @ott/crypto-trips → back-components)
  //    Check longer/more-specific scopes first
  if (registry.packageScopes && jiraIssue.description) {
    const scopes = Object.keys(registry.packageScopes)
      .sort((a, b) => b.length - a.length);
    for (const scope of scopes) {
      if (jiraIssue.description.includes(scope)) {
        slug = registry.packageScopes[scope]![0] ?? null;
        break;
      }
    }
  }

  // 2. Default for project
  if (!slug) slug = project.default;

  const repo = registry.repos[slug];
  if (!repo) return null;

  const { project: bbProject, baseCloneUrl } = registry.bitbucket;

  // Additional repos if package scope matches multiple
  const additionalRepos = findScopeRepos(registry, jiraIssue.description, slug);

  return {
    repoUrl: `${baseCloneUrl}/${slug}.git`,
    targetBranch: repo.branch,
    projectKey: bbProject,
    repoSlug: slug,
    repoDescription: repo.description,
    additionalRepos: additionalRepos.length > 0 ? additionalRepos : undefined,
  };
}

function findScopeRepos(
  registry: KnowledgeRegistry,
  description: string,
  primarySlug: string
): string[] {
  if (!registry.packageScopes || !description) return [];
  const extras: string[] = [];
  for (const [scope, slugs] of Object.entries(registry.packageScopes)) {
    if (description.includes(scope)) {
      for (const s of slugs) {
        if (s !== primarySlug && !extras.includes(s)) extras.push(s);
      }
    }
  }
  return extras;
}

// ─── Git format helpers ───

export function formatBranch(git: GitConventions, ticketKey: string, shortDesc: string): string {
  const normalized = shortDesc
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeDesc = normalized || "task";

  return git.branchFormat
    .replace("{{TICKET_KEY}}", ticketKey)
    .replace("{{SHORT_DESCRIPTION}}", safeDesc)
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatSquashCommit(git: GitConventions, ticketKey: string, summary: string): string {
  return git.squashCommitFormat
    .replace("{{TICKET_KEY}}", ticketKey)
    .replace("{{SUMMARY}}", summary);
}
