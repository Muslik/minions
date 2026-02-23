import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { renderTemplate, loadTemplate } from "../src/services/prompt.ts";

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "minions-prompt-test-"));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("renderTemplate", () => {
  it("replaces a single {{VAR}} with its value", () => {
    const result = renderTemplate("Hello, {{NAME}}!", { NAME: "World" });
    assert.equal(result, "Hello, World!");
  });

  it("replaces multiple different variables", () => {
    const template = "{{GREETING}}, {{SUBJECT}}! Your ticket is {{TICKET}}.";
    const result = renderTemplate(template, {
      GREETING: "Hello",
      SUBJECT: "Alice",
      TICKET: "AVIA-123",
    });
    assert.equal(result, "Hello, Alice! Your ticket is AVIA-123.");
  });

  it("replaces the same variable multiple times", () => {
    const result = renderTemplate("{{A}} and {{A}} again", { A: "foo" });
    assert.equal(result, "foo and foo again");
  });

  it("leaves unknown vars as-is", () => {
    const result = renderTemplate("{{KNOWN}} and {{UNKNOWN}}", {
      KNOWN: "yes",
    });
    assert.equal(result, "yes and {{UNKNOWN}}");
  });

  it("returns the template unchanged when vars map is empty", () => {
    const template = "No vars here";
    assert.equal(renderTemplate(template, {}), template);
  });

  it("handles a template with no placeholders", () => {
    const result = renderTemplate("plain text", { FOO: "bar" });
    assert.equal(result, "plain text");
  });

  it("handles empty string template", () => {
    assert.equal(renderTemplate("", { FOO: "bar" }), "");
  });
});

describe("loadTemplate", () => {
  it("reads a .md file from disk by name without extension", () => {
    const content = "# Hello {{NAME}}\nThis is a template.";
    writeFileSync(join(tmpDir, "greeting.md"), content, "utf-8");

    const loaded = loadTemplate(tmpDir, "greeting");
    assert.equal(loaded, content);
  });

  it("reads a .md file when name already has .md extension", () => {
    const content = "Template with extension.";
    writeFileSync(join(tmpDir, "ext.md"), content, "utf-8");

    const loaded = loadTemplate(tmpDir, "ext.md");
    assert.equal(loaded, content);
  });

  it("throws when the template file does not exist", () => {
    assert.throws(
      () => loadTemplate(tmpDir, "nonexistent"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("Prompt template not found"));
        return true;
      }
    );
  });

  it("loads and renders a template end-to-end", () => {
    const template = "Issue: {{ISSUE_KEY}} — {{SUMMARY}}";
    writeFileSync(join(tmpDir, "issue.md"), template, "utf-8");

    const loaded = loadTemplate(tmpDir, "issue");
    const rendered = renderTemplate(loaded, {
      ISSUE_KEY: "AVIA-42",
      SUMMARY: "Fix the bug",
    });

    assert.equal(rendered, "Issue: AVIA-42 — Fix the bug");
  });
});
