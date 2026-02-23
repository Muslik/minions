import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { execSync } from "child_process";

const MAX_OUTPUT = 8 * 1024;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT) + "\n... [truncated]";
}

function assertWithinWorktree(
  filePath: string,
  worktreePath: string
): string {
  const absWorktree = resolve(worktreePath);
  const absTarget = resolve(worktreePath, filePath);
  if (
    !absTarget.startsWith(absWorktree + "/") &&
    absTarget !== absWorktree
  ) {
    throw new Error(
      `Path traversal blocked: ${filePath} resolves outside worktree`
    );
  }
  return absTarget;
}

function createReadFileTool(worktreePath: string) {
  return tool(
    async ({ path }: { path: string }) => {
      const resolved = assertWithinWorktree(path, worktreePath);
      return truncate(readFileSync(resolved, "utf-8"));
    },
    {
      name: "read_file",
      description: "Read the contents of a file",
      schema: z.object({
        path: z.string().describe("Relative path to the file within the workspace"),
      }),
    }
  );
}

function createListDirectoryTool(worktreePath: string) {
  return tool(
    async ({ path }: { path: string }) => {
      const resolved = assertWithinWorktree(path || ".", worktreePath);
      const entries = readdirSync(resolved, { withFileTypes: true });
      const lines = entries.map((e) =>
        e.isDirectory() ? `${e.name}/` : e.name
      );
      return truncate(lines.join("\n"));
    },
    {
      name: "list_directory",
      description: "List files and directories at the given path",
      schema: z.object({
        path: z.string().default(".").describe("Relative path to list"),
      }),
    }
  );
}

function createSearchFilesTool(worktreePath: string) {
  return tool(
    async ({ pattern }: { pattern: string }) => {
      try {
        const result = execSync(
          `find . -name '${pattern.replace(/'/g, "\\'")}' -type f | head -100`,
          { cwd: worktreePath, encoding: "utf-8", timeout: 10_000 }
        );
        return truncate(result || "No files found");
      } catch {
        return "No files found";
      }
    },
    {
      name: "search_files",
      description: "Search for files matching a glob pattern",
      schema: z.object({
        pattern: z.string().describe("File name pattern (e.g. '*.ts')"),
      }),
    }
  );
}

function createGrepTool(worktreePath: string) {
  return tool(
    async ({ pattern, glob }: { pattern: string; glob?: string }) => {
      try {
        const globArg = glob
          ? `--include='${glob.replace(/'/g, "\\'")}'`
          : "";
        const result = execSync(
          `grep -rn ${globArg} -- '${pattern.replace(/'/g, "\\'")}' . | head -200`,
          { cwd: worktreePath, encoding: "utf-8", timeout: 10_000 }
        );
        return truncate(result || "No matches");
      } catch {
        return "No matches";
      }
    },
    {
      name: "grep",
      description: "Search file contents for a pattern",
      schema: z.object({
        pattern: z.string().describe("Search pattern"),
        glob: z.string().optional().describe("File glob filter (e.g. '*.ts')"),
      }),
    }
  );
}

function createWriteFileTool(worktreePath: string) {
  return tool(
    async ({ path, content }: { path: string; content: string }) => {
      const resolved = assertWithinWorktree(path, worktreePath);
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, content, "utf-8");
      return `Written ${content.length} bytes to ${path}`;
    },
    {
      name: "write_file",
      description: "Write content to a file (create or overwrite)",
      schema: z.object({
        path: z.string().describe("Relative path to the file"),
        content: z.string().describe("File content to write"),
      }),
    }
  );
}

function createBashTool(worktreePath: string) {
  return tool(
    async ({ command }: { command: string }) => {
      try {
        const result = execSync(command, {
          cwd: worktreePath,
          encoding: "utf-8",
          timeout: 120_000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        return truncate(result);
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; status?: number };
        return truncate(
          `Exit code: ${e.status ?? 1}\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? ""}`
        );
      }
    },
    {
      name: "bash",
      description: "Execute a bash command in the workspace",
      schema: z.object({
        command: z.string().describe("The bash command to execute"),
      }),
    }
  );
}

export type AgentRole = "architect" | "coder" | "reviewer" | "clarify";

export function createToolsForRole(role: AgentRole, worktreePath: string) {
  const readOnlyTools = [
    createReadFileTool(worktreePath),
    createListDirectoryTool(worktreePath),
    createSearchFilesTool(worktreePath),
    createGrepTool(worktreePath),
  ];

  if (role === "coder") {
    return [
      ...readOnlyTools,
      createWriteFileTool(worktreePath),
      createBashTool(worktreePath),
    ];
  }

  return readOnlyTools;
}
