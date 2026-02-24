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

  it("reads a line range from a file", async () => {
    writeFileSync(join(tmpDir, "chunked.txt"), "a\nb\nc\nd\ne", "utf-8");

    const tools = createToolsForRole("architect", tmpDir);
    const readFile = tools.find((t) => t.name === "read_file")!;
    const result = await readFile.invoke({
      path: "chunked.txt",
      startLine: 2,
      endLine: 4,
    });

    assert.equal(result, "b\nc\nd");
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

describe("large-file safety", () => {
  it("auto-chunks large files across sequential read_file calls", async () => {
    const lines = Array.from(
      { length: 700 },
      (_, i) => `line-${i + 1}-${"x".repeat(120)}`
    );
    writeFileSync(join(tmpDir, "large.txt"), lines.join("\n"), "utf-8");

    const tools = createToolsForRole("architect", tmpDir);
    const readFile = tools.find((t) => t.name === "read_file")!;

    const chunk1 = await readFile.invoke({ path: "large.txt" });
    assert.ok(chunk1.includes("[auto-chunk] 'large.txt' lines 1-300"));
    assert.ok(chunk1.includes("line-1-"));
    assert.ok(chunk1.includes("[auto-chunk] more available"));

    const chunk2 = await readFile.invoke({ path: "large.txt" });
    assert.ok(chunk2.includes("[auto-chunk] 'large.txt' lines 301-600"));
    assert.ok(chunk2.includes("line-301-"));
    assert.ok(chunk2.includes("[auto-chunk] more available"));

    const chunk3 = await readFile.invoke({ path: "large.txt" });
    assert.ok(chunk3.includes("[auto-chunk] 'large.txt' lines 601-700"));
    assert.ok(chunk3.includes("line-601-"));
    assert.ok(chunk3.includes("[auto-chunk] end of file reached"));
  });

  it("blocks overwrite of large file until full read is completed", async () => {
    const lines = Array.from(
      { length: 700 },
      (_, i) => `line-${i + 1}-${"y".repeat(120)}`
    );
    writeFileSync(join(tmpDir, "guarded.txt"), lines.join("\n"), "utf-8");

    const tools = createToolsForRole("coder", tmpDir);
    const readFile = tools.find((t) => t.name === "read_file")!;
    const writeFile = tools.find((t) => t.name === "write_file")!;

    await assert.rejects(
      () => writeFile.invoke({ path: "guarded.txt", content: "short" }),
      (err: Error) => {
        assert.ok(err.message.includes("Refusing to overwrite large file"));
        return true;
      }
    );

    let last = "";
    for (let i = 0; i < 5; i++) {
      last = await readFile.invoke({ path: "guarded.txt" });
      if (last.includes("[auto-chunk] end of file reached")) break;
    }
    assert.ok(last.includes("[auto-chunk] end of file reached"));

    const result = await writeFile.invoke({
      path: "guarded.txt",
      content: "short",
    });
    assert.ok(result.includes("Written 5 bytes to guarded.txt"));
  });
});
