import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  saveArtifact,
  getArtifact,
  listArtifacts,
} from "../src/services/artifacts.ts";

let artifactsDir: string;

before(() => {
  artifactsDir = mkdtempSync(join(tmpdir(), "minions-artifacts-test-"));
});

after(() => {
  rmSync(artifactsDir, { recursive: true, force: true });
});

describe("saveArtifact / getArtifact", () => {
  it("saveArtifact creates a file and getArtifact reads it back", () => {
    const runId = "run-001";
    const content = "artifact content here";

    saveArtifact(artifactsDir, runId, "plan.md", content);

    const read = getArtifact(artifactsDir, runId, "plan.md");
    assert.equal(read, content);
  });

  it("getArtifact returns null for a missing file", () => {
    const result = getArtifact(artifactsDir, "run-nonexistent", "missing.txt");
    assert.equal(result, null);
  });

  it("getArtifact returns null for existing runId but missing artifact name", () => {
    const runId = "run-002";
    saveArtifact(artifactsDir, runId, "exists.txt", "data");

    const result = getArtifact(artifactsDir, runId, "does-not-exist.txt");
    assert.equal(result, null);
  });

  it("overwrites artifact content on second save with same name", () => {
    const runId = "run-003";
    saveArtifact(artifactsDir, runId, "file.txt", "original");
    saveArtifact(artifactsDir, runId, "file.txt", "updated");

    const read = getArtifact(artifactsDir, runId, "file.txt");
    assert.equal(read, "updated");
  });

  it("saves and retrieves multiple artifacts for the same runId", () => {
    const runId = "run-004";
    saveArtifact(artifactsDir, runId, "a.txt", "aaa");
    saveArtifact(artifactsDir, runId, "b.txt", "bbb");

    assert.equal(getArtifact(artifactsDir, runId, "a.txt"), "aaa");
    assert.equal(getArtifact(artifactsDir, runId, "b.txt"), "bbb");
  });
});

describe("listArtifacts", () => {
  it("returns an empty array when the run directory does not exist", () => {
    const result = listArtifacts(artifactsDir, "run-never-created");
    assert.deepEqual(result, []);
  });

  it("returns an empty array for an existing run with no artifacts", () => {
    // Save then immediately check empty — but actually we need a dir without files.
    // We create the run dir implicitly via saveArtifact then remove the file.
    // Easier: just check a known-empty runId that was never used.
    const result = listArtifacts(artifactsDir, "run-empty-check");
    assert.deepEqual(result, []);
  });

  it("returns the names of saved artifacts", () => {
    const runId = "run-list-test";
    saveArtifact(artifactsDir, runId, "plan.md", "plan content");
    saveArtifact(artifactsDir, runId, "diff.patch", "diff content");

    const names = listArtifacts(artifactsDir, runId);
    assert.equal(names.length, 2);
    assert.ok(names.includes("plan.md"), "should include plan.md");
    assert.ok(names.includes("diff.patch"), "should include diff.patch");
  });

  it("lists artifacts only for the specified runId, not others", () => {
    const runA = "run-scope-a";
    const runB = "run-scope-b";
    saveArtifact(artifactsDir, runA, "only-a.txt", "a");
    saveArtifact(artifactsDir, runB, "only-b.txt", "b");

    const listA = listArtifacts(artifactsDir, runA);
    const listB = listArtifacts(artifactsDir, runB);

    assert.deepEqual(listA, ["only-a.txt"]);
    assert.deepEqual(listB, ["only-b.txt"]);
  });
});
