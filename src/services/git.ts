import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join, basename, resolve } from "path";
import { GitError } from "../domain/errors.js";

function run(cmd: string, cwd?: string, env?: NodeJS.ProcessEnv): string {
  try {
    return execSync(cmd, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
      env,
    }).trim();
  } catch (err) {
    throw new GitError({ message: `git command failed: ${cmd}`, cause: err });
  }
}

function commitIdentityEnv(): NodeJS.ProcessEnv {
  const name =
    process.env["ORCH_GIT_AUTHOR_NAME"]
    ?? process.env["GIT_AUTHOR_NAME"]
    ?? process.env["GIT_COMMITTER_NAME"]
    ?? "minions";
  const email =
    process.env["ORCH_GIT_AUTHOR_EMAIL"]
    ?? process.env["GIT_AUTHOR_EMAIL"]
    ?? process.env["GIT_COMMITTER_EMAIL"]
    ?? "minions@onetwotrip.com";

  return {
    ...process.env,
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: process.env["GIT_COMMITTER_NAME"] ?? name,
    GIT_COMMITTER_EMAIL: process.env["GIT_COMMITTER_EMAIL"] ?? email,
  };
}

function commit(worktreePath: string, message: string): void {
  run(`git commit -m "${message}"`, worktreePath, commitIdentityEnv());
}

export function ensureMirror(repoUrl: string, reposDir: string): string {
  mkdirSync(reposDir, { recursive: true });
  const repoName = basename(repoUrl, ".git") + ".git";
  const mirrorPath = join(reposDir, repoName);
  if (existsSync(mirrorPath)) {
    run("git fetch --all --prune", mirrorPath);
  } else {
    run(`git clone --mirror ${repoUrl} ${mirrorPath}`);
  }
  return mirrorPath;
}

export function addWorktree(
  mirrorPath: string,
  branch: string,
  workspacesDir: string,
  targetBranch = "main"
): string {
  const absWorkspacesDir = resolve(workspacesDir);
  mkdirSync(absWorkspacesDir, { recursive: true });

  // Remove stale worktree dirs for this branch (keep the branch itself)
  const safeBranch = branch.replace(/[^a-zA-Z0-9_-]/g, "_");
  for (const entry of readdirSync(absWorkspacesDir)) {
    if (entry.startsWith(safeBranch)) {
      const stale = join(absWorkspacesDir, entry);
      try { run(`git worktree remove --force ${stale}`, mirrorPath); } catch { /* */ }
      rmSync(stale, { recursive: true, force: true });
    }
  }
  try { run("git worktree prune", mirrorPath); } catch { /* */ }

  const timestamp = Date.now();
  const worktreePath = join(absWorkspacesDir, `${safeBranch}-${timestamp}`);

  // Always start from the latest target branch tip.
  if (branchExists(mirrorPath, branch)) {
    run(
      `git worktree add --force -B ${branch} ${worktreePath} ${targetBranch}`,
      mirrorPath
    );
  } else {
    run(
      `git worktree add -b ${branch} ${worktreePath} ${targetBranch}`,
      mirrorPath
    );
  }

  return worktreePath;
}

function branchExists(mirrorPath: string, branch: string): boolean {
  try {
    execSync(`git rev-parse --verify ${branch}`, {
      cwd: mirrorPath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

export function removeWorktree(worktreePath: string): void {
  if (!existsSync(worktreePath)) return;
  try {
    run(`git worktree remove --force ${worktreePath}`);
  } catch {
    // best-effort removal
  }
}

export function getHeadCommit(worktreePath: string): string {
  return run("git rev-parse HEAD", worktreePath);
}

export function finalizeAndPush(
  worktreePath: string,
  branch: string,
  squash = false,
  targetBranch = "main"
): void {
  run("git add -A", worktreePath);

  const hasChanges = (() => {
    try {
      const status = execSync("git status --porcelain", {
        cwd: worktreePath,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf-8",
      }).trim();
      return status.length > 0;
    } catch {
      return false;
    }
  })();

  if (hasChanges) {
    commit(worktreePath, `feat: ${branch}`);
  }

  if (squash) {
    const mergeBase = run(`git merge-base ${targetBranch} HEAD`, worktreePath);
    run(`git reset --soft ${mergeBase}`, worktreePath);
    commit(worktreePath, `feat: ${branch}`);
  }

  try {
    run(`git -c remote.origin.mirror=false push origin ${branch}`, worktreePath);
  } catch {
    // Branch can be recreated from fresh target branch between runs.
    run(
      `git -c remote.origin.mirror=false push --force-with-lease origin ${branch}`,
      worktreePath
    );
  }
}
