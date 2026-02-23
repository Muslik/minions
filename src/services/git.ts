import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join, basename, resolve } from "path";
import { GitError } from "../domain/errors.js";

function run(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch (err) {
    throw new GitError({ message: `git command failed: ${cmd}`, cause: err });
  }
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
  workspacesDir: string
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

  if (branchExists(mirrorPath, branch)) {
    // Reuse existing branch (preserves PR commits)
    run(`git worktree add ${worktreePath} ${branch}`, mirrorPath);
  } else {
    // Create new branch
    run(`git worktree add -b ${branch} ${worktreePath}`, mirrorPath);
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
  squash = false
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

  if (!hasChanges) return;

  if (squash) {
    const firstCommit = run(
      "git rev-list --max-parents=0 HEAD",
      worktreePath
    );
    run(`git reset --soft ${firstCommit}`, worktreePath);
    run(`git commit -m "squash: ${branch}"`, worktreePath);
  } else {
    run(`git commit -m "feat: ${branch}"`, worktreePath);
  }

  run(`git push origin ${branch}`, worktreePath);
}
