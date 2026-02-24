import { readFileSync } from "fs";
import { join } from "path";
import { RunStatus } from "../../domain/types.js";
import { WORKER_PROFILES } from "../../domain/constants.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

const SOURCE_WORKDIR = "/workspace";
const SANDBOX_WORKDIR = "/tmp/workspace";
const FNM_WORKDIR = "/tmp/fnm";
const EVENT_LOG_LIMIT = 20_000;

export function createValidateNode(deps: NodeDeps) {
  return async function validateNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { worktreePath, validationCommands, runId } = state.context;

    deps.syncStatus(runId, RunStatus.VALIDATING);

    if (!validationCommands || validationCommands.length === 0) {
      return { status: RunStatus.REVIEWING, error: undefined };
    }

    if (!worktreePath) {
      return { status: RunStatus.REVIEWING, error: undefined };
    }

    const profile = WORKER_PROFILES["validator"]!;
    const binds = [`${worktreePath}:${SOURCE_WORKDIR}:ro`];
    const exactNodeVersion = resolveExactNodeVersion(worktreePath);
    const script = buildValidationScript(validationCommands, exactNodeVersion);

    deps.emitEvent(runId, "validation_start", {
      strategy: exactNodeVersion ? "fnm_exact" : "container_default",
      requestedNodeVersion: exactNodeVersion ?? null,
      commands: validationCommands,
    });

    let result:
      | {
          stdout: string;
          stderr: string;
          exitCode: number;
        }
      | undefined;
    try {
      result = await deps.docker.runScript(profile, binds, script);
    } catch (err) {
      const detail = formatError(err);
      deps.emitEvent(runId, "validation_result", {
        result: "ERROR",
        exitCode: -1,
        error: truncateForEvent(detail),
      });
      return {
        error: `Validation runtime error\n${detail}`,
      };
    }

    deps.emitEvent(runId, "validation_result", {
      result: result.exitCode === 0 ? "OK" : "ERROR",
      exitCode: result.exitCode,
      stdout: truncateForEvent(result.stdout),
      stderr: truncateForEvent(result.stderr),
    });

    if (result.exitCode === 0) {
      return { status: RunStatus.REVIEWING, error: undefined };
    }

    return {
      error: formatValidationFailure(result),
    };
  };
}

function buildValidationScript(
  validationCommands: string[],
  exactNodeVersion?: string
): string {
  const lines = [
    "set -euo pipefail",
    `rm -rf ${SANDBOX_WORKDIR}`,
    `mkdir -p ${SANDBOX_WORKDIR}`,
    `cp -a ${SOURCE_WORKDIR}/. ${SANDBOX_WORKDIR}`,
    `cd ${SANDBOX_WORKDIR}`,
  ];

  if (exactNodeVersion) {
    lines.push(
      `rm -rf ${FNM_WORKDIR}`,
      `mkdir -p ${FNM_WORKDIR}`,
      `export FNM_DIR=${FNM_WORKDIR}`,
      "eval \"$(fnm env --shell bash --fnm-dir \\\"$FNM_DIR\\\")\"",
      `fnm install ${exactNodeVersion}`,
      `fnm use ${exactNodeVersion}`
    );
  }

  lines.push(
    "node -v",
    "(corepack enable >/dev/null 2>&1 || true)",
    "pnpm install --frozen-lockfile --ignore-scripts"
  );

  for (const command of validationCommands) {
    const normalized = normalizeCommand(command);
    if (!normalized) continue;
    lines.push(
      `echo ${shellQuote(`[validate] ${normalized}`)}`,
      normalized
    );
  }

  return lines.join("\n");
}

function resolveExactNodeVersion(worktreePath: string): string | undefined {
  try {
    const raw = readFileSync(join(worktreePath, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as {
      engines?: { node?: string };
    };
    const spec = parsed.engines?.node?.trim();
    if (!spec) return undefined;
    if (!/^v?\d+\.\d+\.\d+$/.test(spec)) return undefined;
    return spec.startsWith("v") ? spec.slice(1) : spec;
  } catch {
    return undefined;
  }
}

function truncateForEvent(text: string): string {
  if (text.length <= EVENT_LOG_LIMIT) return text;
  return text.slice(0, EVENT_LOG_LIMIT) + "...<truncated>";
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const cause = stringifyCause((err as { cause?: unknown }).cause);
    return cause ? `${err.message}; cause=${cause}` : err.message;
  }
  return stringifyCause(err);
}

function stringifyCause(cause: unknown): string {
  if (!cause) return "";
  if (typeof cause === "string") return cause;
  if (cause instanceof Error) return cause.message;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

function formatValidationFailure(result: {
  exitCode: number;
  stdout: string;
  stderr: string;
}): string {
  return [
    `Validation failed (exitCode=${result.exitCode})`,
    `Stdout: ${result.stdout}`,
    `Stderr: ${result.stderr}`,
  ].join("\n");
}

function normalizeCommand(command: string): string {
  return command.replace(/\r?\n/g, " ").trim();
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
