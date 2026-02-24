import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { OrchestratorConfigSchema, type OrchestratorConfig } from "./schema.js";

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
    cfg[section][key] = coerce ? coerce(value) : value;
  };

  set("server", "port", e["ORCH_SERVER_PORT"], Number);
  set("docker", "image", e["ORCH_DOCKER_IMAGE"]);
  set("storage", "dbPath", e["ORCH_DB_PATH"]);
  set("jira", "baseUrl", e["ORCH_JIRA_BASE_URL"]);
  set("jira", "token", e["ORCH_JIRA_TOKEN"]);
  set("bitbucket", "baseUrl", e["ORCH_BITBUCKET_BASE_URL"]);
  set("bitbucket", "token", e["ORCH_BITBUCKET_TOKEN"]);
  set("confluence", "baseUrl", e["ORCH_CONFLUENCE_BASE_URL"]);
  set("confluence", "token", e["ORCH_CONFLUENCE_TOKEN"]);
  set("loop", "baseUrl", e["ORCH_LOOP_BASE_URL"]);
  set("loop", "token", e["ORCH_LOOP_TOKEN"]);
  // notifier.telegram — nested, handle manually
  if (
    e["ORCH_TELEGRAM_BOT_TOKEN"] !== undefined ||
    e["ORCH_TELEGRAM_CHAT_ID"] !== undefined
  ) {
    cfg["notifier"] ??= {};
    (cfg["notifier"] as Record<string, unknown>)["telegram"] ??= {};
    const tg = (cfg["notifier"] as Record<string, unknown>)[
      "telegram"
    ] as Record<string, unknown>;
    if (e["ORCH_TELEGRAM_BOT_TOKEN"] !== undefined) {
      tg["botToken"] = e["ORCH_TELEGRAM_BOT_TOKEN"];
    }
    if (e["ORCH_TELEGRAM_CHAT_ID"] !== undefined) {
      tg["chatId"] = e["ORCH_TELEGRAM_CHAT_ID"];
    }
  }
  set("agent", "model", e["ORCH_AGENT_MODEL"]);
  set("agent", "authDir", e["ORCH_AUTH_DIR"]);
  set("agent", "baseUrl", e["ORCH_AGENT_BASE_URL"]);
  // agent.recursionLimits — nested
  if (
    e["ORCH_AGENT_RECURSION_CLARIFY"] !== undefined ||
    e["ORCH_AGENT_RECURSION_ARCHITECT"] !== undefined ||
    e["ORCH_AGENT_RECURSION_CODER"] !== undefined ||
    e["ORCH_AGENT_RECURSION_REVIEWER"] !== undefined
  ) {
    cfg["agent"] ??= {};
    (cfg["agent"] as Record<string, unknown>)["recursionLimits"] ??= {};
    const limits = (cfg["agent"] as Record<string, unknown>)[
      "recursionLimits"
    ] as Record<string, unknown>;
    if (e["ORCH_AGENT_RECURSION_CLARIFY"] !== undefined) {
      limits["clarify"] = Number(e["ORCH_AGENT_RECURSION_CLARIFY"]);
    }
    if (e["ORCH_AGENT_RECURSION_ARCHITECT"] !== undefined) {
      limits["architect"] = Number(e["ORCH_AGENT_RECURSION_ARCHITECT"]);
    }
    if (e["ORCH_AGENT_RECURSION_CODER"] !== undefined) {
      limits["coder"] = Number(e["ORCH_AGENT_RECURSION_CODER"]);
    }
    if (e["ORCH_AGENT_RECURSION_REVIEWER"] !== undefined) {
      limits["reviewer"] = Number(e["ORCH_AGENT_RECURSION_REVIEWER"]);
    }
  }

  return cfg as Record<string, unknown>;
}

export function loadConfig(path?: string): OrchestratorConfig {
  const configPath =
    path ?? process.env["ORCH_CONFIG_PATH"] ?? "config/orchestrator.yaml";
  const raw = parseYaml(readFileSync(configPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const merged = mergeEnvVars(raw);
  return OrchestratorConfigSchema.parse(merged);
}
