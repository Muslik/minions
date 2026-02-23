import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Config tests are self-contained: we import schema.ts directly (no
 * transitive .js imports) and replicate the loadConfig logic inline so we
 * don't pull in loader.ts which uses .js import specifiers that confuse
 * --experimental-strip-types.
 */
import { OrchestratorConfigSchema } from "../src/config/schema.ts";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

// ── inline mergeEnvVars + loadConfig so we avoid importing loader.ts ────────

function mergeEnvVars(raw: Record<string, unknown>): Record<string, unknown> {
  const cfg = structuredClone(raw) as Record<string, Record<string, unknown>>;
  const e = process.env;

  const set = (
    section: string,
    key: string,
    value: string | undefined,
    coerce?: (v: string) => unknown
  ) => {
    if (value === undefined) return;
    cfg[section] ??= {};
    cfg[section]![key] = coerce ? coerce(value) : value;
  };

  set("server", "port", e["ORCH_SERVER_PORT"], Number);
  set("docker", "image", e["ORCH_DOCKER_IMAGE"]);
  set("storage", "dbPath", e["ORCH_DB_PATH"]);
  set("jira", "baseUrl", e["ORCH_JIRA_BASE_URL"]);
  set("jira", "token", e["ORCH_JIRA_TOKEN"]);
  set("bitbucket", "baseUrl", e["ORCH_BITBUCKET_BASE_URL"]);
  set("bitbucket", "token", e["ORCH_BITBUCKET_TOKEN"]);
  if (e["ORCH_TELEGRAM_BOT_TOKEN"]) {
    cfg["notifier"] ??= {};
    (cfg["notifier"] as Record<string, unknown>)["telegram"] ??= {};
    ((cfg["notifier"] as Record<string, unknown>)["telegram"] as Record<string, unknown>)["botToken"] = e["ORCH_TELEGRAM_BOT_TOKEN"];
  }
  set("agent", "model", e["ORCH_AGENT_MODEL"]);
  set("agent", "authDir", e["ORCH_AUTH_DIR"]);

  return cfg as Record<string, unknown>;
}

function loadConfig(path: string) {
  const raw = parseYaml(readFileSync(path, "utf-8")) as Record<string, unknown>;
  const merged = mergeEnvVars(raw);
  return OrchestratorConfigSchema.parse(merged);
}

// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "minions-config-test-"));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const VALID_YAML = `
server:
  host: "127.0.0.1"
  port: 8080

docker:
  image: "my-image:latest"
  socketPath: "/var/run/docker.sock"

storage:
  dbPath: "/tmp/test.db"
  artifactsDir: "/tmp/artifacts"
  reposDir: "/tmp/repos"
  workspacesDir: "/tmp/workspaces"

jira:
  baseUrl: "https://jira.example.com"
  token: "jira-token"

bitbucket:
  baseUrl: "https://bitbucket.example.com"
  token: "bb-token"

notifier:
  telegram:
    botToken: "test-bot-token"
    chatId: "123456"

agent:
  model: "gpt-5.3-codex"
  authDir: "/opt/codex"
`;

const MINIMAL_YAML = `
docker:
  image: "some-image"

storage:
  dbPath: "/tmp/db"
  artifactsDir: "/tmp/art"
  reposDir: "/tmp/repos"
  workspacesDir: "/tmp/ws"

jira:
  baseUrl: "https://jira.example.com"
  token: "tok"

bitbucket:
  baseUrl: "https://bb.example.com"
  token: "bb-tok"

notifier:
  telegram:
    botToken: "test-token"
    chatId: "123456"

agent: {}
`;

describe("Config loading", () => {
  it("parses a valid full config correctly", () => {
    const configPath = join(tmpDir, "valid.yaml");
    writeFileSync(configPath, VALID_YAML, "utf-8");

    const config = loadConfig(configPath);

    assert.equal(config.server.host, "127.0.0.1");
    assert.equal(config.server.port, 8080);
    assert.equal(config.docker.image, "my-image:latest");
    assert.equal(config.storage.dbPath, "/tmp/test.db");
    assert.equal(config.jira.baseUrl, "https://jira.example.com");
    assert.equal(config.jira.token, "jira-token");
    assert.equal(config.bitbucket.token, "bb-token");
    assert.equal(config.notifier.telegram.botToken, "test-bot-token");
    assert.equal(config.agent.model, "gpt-5.3-codex");
    assert.equal(config.agent.authDir, "/opt/codex");
  });

  it("throws a ZodError when required fields are missing", () => {
    const configPath = join(tmpDir, "missing.yaml");
    // Missing docker.image (required field)
    writeFileSync(configPath, `
server:
  host: "localhost"
docker:
  socketPath: "/var/run/docker.sock"
storage:
  dbPath: "/tmp/db"
  artifactsDir: "/tmp/art"
  reposDir: "/tmp/repos"
  workspacesDir: "/tmp/ws"
jira:
  baseUrl: "https://jira.example.com"
  token: "tok"
bitbucket:
  baseUrl: "https://bb.example.com"
  token: "tok"
notifier:
  telegram:
    botToken: "test-token"
    chatId: "123456"
agent: {}
`, "utf-8");

    assert.throws(
      () => loadConfig(configPath),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        // ZodError has a "issues" property
        assert.ok("issues" in (err as unknown as Record<string, unknown>));
        return true;
      }
    );
  });

  it("env var ORCH_SERVER_PORT overrides YAML port", () => {
    const configPath = join(tmpDir, "port-override.yaml");
    writeFileSync(configPath, VALID_YAML, "utf-8");

    const originalPort = process.env["ORCH_SERVER_PORT"];
    try {
      process.env["ORCH_SERVER_PORT"] = "9999";
      const config = loadConfig(configPath);
      assert.equal(config.server.port, 9999);
    } finally {
      if (originalPort === undefined) {
        delete process.env["ORCH_SERVER_PORT"];
      } else {
        process.env["ORCH_SERVER_PORT"] = originalPort;
      }
    }
  });

  it("applies default values for host, port, model, and authDir", () => {
    const configPath = join(tmpDir, "defaults.yaml");
    writeFileSync(configPath, MINIMAL_YAML, "utf-8");

    const config = loadConfig(configPath);

    // server defaults
    assert.equal(config.server.host, "0.0.0.0");
    assert.equal(config.server.port, 3000);
    // docker defaults
    assert.equal(config.docker.socketPath, "/var/run/docker.sock");
    // agent defaults
    assert.equal(config.agent.model, "gpt-5.3-codex");
    assert.equal(config.agent.authDir, "~/.codex");
  });

  it("parses schema directly with OrchestratorConfigSchema", () => {
    const raw = {
      server: {},
      docker: { image: "img" },
      storage: {
        dbPath: "/db",
        artifactsDir: "/art",
        reposDir: "/repos",
        workspacesDir: "/ws",
      },
      jira: {
        baseUrl: "https://jira.example.com",
        token: "t",
      },
      bitbucket: { baseUrl: "https://bb.example.com", token: "t" },
      notifier: { telegram: { botToken: "t", chatId: "123" } },
      agent: {},
    };

    const config = OrchestratorConfigSchema.parse(raw);
    assert.equal(config.server.host, "0.0.0.0");
    assert.equal(config.server.port, 3000);
    assert.equal(config.agent.model, "gpt-5.3-codex");
    assert.equal(config.agent.authDir, "~/.codex");
  });
});
