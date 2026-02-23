import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createToolsForRole, type AgentRole } from "../src/services/tools.ts";

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "minions-tools-test-"));
  // Create a workspace with some files
  mkdirSync(join(tmpDir, "src"), { recursive: true });
  writeFileSync(join(tmpDir, "README.md"), "# Hello\nWorld", "utf-8");
  writeFileSync(join(tmpDir, "src", "index.ts"), "console.log('hi');", "utf-8");
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function toolNames(role: AgentRole): string[] {
  return createToolsForRole(role, tmpDir).map((t) => t.name);
}

describe("createToolsForRole — role filtering", () => {
  it("architect gets only read-only tools (4 tools)", () => {
    const names = toolNames("architect");
    assert.deepEqual(names, ["read_file", "list_directory", "search_files", "grep"]);
  });

  it("reviewer gets only read-only tools (4 tools)", () => {
    const names = toolNames("reviewer");
    assert.deepEqual(names, ["read_file", "list_directory", "search_files", "grep"]);
  });

  it("coder gets read-only + write_file + bash (6 tools)", () => {
    const names = toolNames("coder");
    assert.deepEqual(names, [
      "read_file",
      "list_directory",
      "search_files",
      "grep",
      "write_file",
      "bash",
    ]);
  });
});

describe("tool execution — read_file", () => {
  it("reads a file within the worktree", async () => {
    const tools = createToolsForRole("architect", tmpDir);
    const readFile = tools.find((t) => t.name === "read_file")!;
    const result = await readFile.invoke({ path: "README.md" });
    assert.equal(result, "# Hello\nWorld");
  });

  it("reads a nested file", async () => {
    const tools = createToolsForRole("architect", tmpDir);
    const readFile = tools.find((t) => t.name === "read_file")!;
    const result = await readFile.invoke({ path: "src/index.ts" });
    assert.equal(result, "console.log('hi');");
  });
});

describe("tool execution — list_directory", () => {
  it("lists root directory", async () => {
    const tools = createToolsForRole("architect", tmpDir);
    const listDir = tools.find((t) => t.name === "list_directory")!;
    const result = await listDir.invoke({ path: "." });
    assert.ok(result.includes("README.md"));
    assert.ok(result.includes("src/"));
  });
});

describe("tool execution — path traversal guard", () => {
  it("blocks absolute path escaping worktree", async () => {
    const tools = createToolsForRole("architect", tmpDir);
    const readFile = tools.find((t) => t.name === "read_file")!;
    await assert.rejects(
      () => readFile.invoke({ path: "/etc/passwd" }),
      (err: Error) => {
        assert.ok(err.message.includes("Path traversal blocked"));
        return true;
      }
    );
  });

  it("blocks relative path traversal with ../", async () => {
    const tools = createToolsForRole("architect", tmpDir);
    const readFile = tools.find((t) => t.name === "read_file")!;
    await assert.rejects(
      () => readFile.invoke({ path: "../../etc/passwd" }),
      (err: Error) => {
        assert.ok(err.message.includes("Path traversal blocked"));
        return true;
      }
    );
  });

  it("blocks path traversal for write_file too", async () => {
    const tools = createToolsForRole("coder", tmpDir);
    const writeFile = tools.find((t) => t.name === "write_file")!;
    await assert.rejects(
      () => writeFile.invoke({ path: "../escape.txt", content: "pwned" }),
      (err: Error) => {
        assert.ok(err.message.includes("Path traversal blocked"));
        return true;
      }
    );
  });
});

describe("tool execution — write_file (coder only)", () => {
  it("writes a new file in the worktree", async () => {
    const tools = createToolsForRole("coder", tmpDir);
    const writeFile = tools.find((t) => t.name === "write_file")!;
    const result = await writeFile.invoke({
      path: "output.txt",
      content: "hello from test",
    });
    assert.ok(result.includes("15 bytes"));
  });

  it("creates nested directories when writing", async () => {
    const tools = createToolsForRole("coder", tmpDir);
    const writeFile = tools.find((t) => t.name === "write_file")!;
    const result = await writeFile.invoke({
      path: "deep/nested/file.txt",
      content: "nested content",
    });
    assert.ok(result.includes("bytes"));

    // Verify it's readable
    const readFile = tools.find((t) => t.name === "read_file")!;
    const content = await readFile.invoke({ path: "deep/nested/file.txt" });
    assert.equal(content, "nested content");
  });
});

describe("tool execution — bash (coder only)", () => {
  it("executes a command in the worktree", async () => {
    const tools = createToolsForRole("coder", tmpDir);
    const bash = tools.find((t) => t.name === "bash")!;
    const result = await bash.invoke({ command: "echo hello" });
    assert.ok(result.includes("hello"));
  });

  it("returns error output for failing commands", async () => {
    const tools = createToolsForRole("coder", tmpDir);
    const bash = tools.find((t) => t.name === "bash")!;
    const result = await bash.invoke({ command: "exit 42" });
    assert.ok(result.includes("Exit code:"));
  });
});

describe("output truncation", () => {
  it("truncates output longer than 8KB", async () => {
    // Create a large file > 8KB
    const largeContent = "x".repeat(10_000);
    writeFileSync(join(tmpDir, "large.txt"), largeContent, "utf-8");

    const tools = createToolsForRole("architect", tmpDir);
    const readFile = tools.find((t) => t.name === "read_file")!;
    const result = await readFile.invoke({ path: "large.txt" });

    assert.ok(result.length < largeContent.length, "output should be truncated");
    assert.ok(result.includes("... [truncated]"));
  });
});
