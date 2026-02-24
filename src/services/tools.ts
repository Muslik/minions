import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { execSync } from "child_process";
import { createHash } from "crypto";

const MAX_OUTPUT = 8 * 1024;
const MAX_FULL_FILE_READ_BYTES = 64 * 1024;
const DEFAULT_READ_CHUNK_LINES = 300;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT) + "\n... [truncated]";
}

type FileReadState = {
  nextStartLine?: number;
  fullyReadHash?: string;
};

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function readFileChunk(
  lines: string[],
  startLine?: number,
  endLine?: number
): { chunk: string; from: number; to: number; total: number } {
  const total = lines.length;
  const from = Math.max(1, startLine ?? 1);
  const to = Math.min(total, endLine ?? Math.min(from + DEFAULT_READ_CHUNK_LINES - 1, total));
  if (to < from) {
    throw new Error(`Invalid range: startLine ${from} is after endLine ${to}`);
  }
  return { chunk: lines.slice(from - 1, to).join("\n"), from, to, total };
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

function createReadFileTool(worktreePath: string, readState: Map<string, FileReadState>) {
  return tool(
    async ({
      path,
      startLine,
      endLine,
    }: {
      path: string;
      startLine?: number;
      endLine?: number;
    }) => {
      const resolved = assertWithinWorktree(path, worktreePath);
      const content = readFileSync(resolved, "utf-8");
      const lines = content.split(/\r?\n/);

      if (startLine !== undefined || endLine !== undefined) {
        const range = readFileChunk(lines, startLine, endLine);
        if (range.from === 1 && range.to === range.total) {
          readState.set(resolved, {
            nextStartLine: 1,
            fullyReadHash: hashContent(content),
          });
        }
        return range.chunk;
      }

      const bytes = Buffer.byteLength(content, "utf-8");
      if (bytes <= MAX_FULL_FILE_READ_BYTES) {
        readState.set(resolved, {
          nextStartLine: 1,
          fullyReadHash: hashContent(content),
        });
        return content;
      }

      const state = readState.get(resolved);
      const from = Math.max(1, state?.nextStartLine ?? 1);
      const range = readFileChunk(lines, from, from + DEFAULT_READ_CHUNK_LINES - 1);
      const isLastChunk = range.to >= range.total;

      readState.set(resolved, {
        nextStartLine: isLastChunk ? 1 : range.to + 1,
        fullyReadHash: isLastChunk ? hashContent(content) : undefined,
      });

      const tail = isLastChunk
        ? "[auto-chunk] end of file reached; this file is now considered fully read in current session."
        : `[auto-chunk] more available; call read_file again with the same path to continue from line ${range.to + 1}.`;

      return [
        `[auto-chunk] '${path}' lines ${range.from}-${range.to} of ${range.total} (${bytes} bytes).`,
        range.chunk,
        tail,
      ].join("\n");
    },
    {
      name: "read_file",
      description: "Read file contents. Large files are auto-chunked across repeated calls on the same path.",
      schema: z.object({
        path: z.string().describe("Relative path to the file within the workspace"),
        startLine: z.number().int().positive().optional().describe("Optional 1-based start line"),
        endLine: z.number().int().positive().optional().describe("Optional 1-based end line"),
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

function createWriteFileTool(worktreePath: string, readState: Map<string, FileReadState>) {
  return tool(
    async ({ path, content }: { path: string; content: string }) => {
      const resolved = assertWithinWorktree(path, worktreePath);

      if (existsSync(resolved)) {
        const existingContent = readFileSync(resolved, "utf-8");
        const existingBytes = Buffer.byteLength(existingContent, "utf-8");

        if (existingBytes > MAX_FULL_FILE_READ_BYTES) {
          const existingHash = hashContent(existingContent);
          const state = readState.get(resolved);
          if (!state?.fullyReadHash || state.fullyReadHash !== existingHash) {
            throw new Error(
              `Refusing to overwrite large file '${path}' (${existingBytes} bytes) before full read. ` +
              "Call read_file repeatedly for this path until you receive '[auto-chunk] end of file reached', then retry."
            );
          }
        }
      }

      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, content, "utf-8");
      readState.set(resolved, { nextStartLine: 1, fullyReadHash: hashContent(content) });
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
  const readState = new Map<string, FileReadState>();

  const readOnlyTools = [
    createReadFileTool(worktreePath, readState),
    createListDirectoryTool(worktreePath),
    createSearchFilesTool(worktreePath),
    createGrepTool(worktreePath),
  ];

  if (role === "coder") {
    return [
      ...readOnlyTools,
      createWriteFileTool(worktreePath, readState),
      createBashTool(worktreePath),
    ];
  }

  return readOnlyTools;
}
