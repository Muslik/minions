import { readFileSync } from "fs";
import { join } from "path";
import { RunStatus } from "../../domain/types.js";
import { WORKER_PROFILES } from "../../domain/constants.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

const SOURCE_WORKDIR = "/workspace";
const SANDBOX_WORKDIR = "/tmp/workspace";
const FNM_WORKDIR = "/tmp/fnm";
const EVENT_LOG_LIMIT = 2000;

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
    const failures: string[] = [];
    const exactNodeVersion = resolveExactNodeVersion(worktreePath);

    deps.emitEvent(runId, "validation_runtime", {
      strategy: exactNodeVersion ? "fnm_exact" : "container_default",
      requestedNodeVersion: exactNodeVersion ?? null,
    });

    await deps.docker.withContainer(profile, binds, async (container) => {
      deps.emitEvent(runId, "validation_bootstrap_start", {
        requestedNodeVersion: exactNodeVersion ?? null,
      });

      const bootstrapScript = [
        "set -euo pipefail",
        `rm -rf ${SANDBOX_WORKDIR}`,
        `mkdir -p ${SANDBOX_WORKDIR}`,
        `cp -a ${SOURCE_WORKDIR}/. ${SANDBOX_WORKDIR}`,
        `cd ${SANDBOX_WORKDIR}`,
        `rm -rf ${FNM_WORKDIR}`,
        `mkdir -p ${FNM_WORKDIR}`,
        `export FNM_DIR=${FNM_WORKDIR}`,
        "eval \"$(fnm env --shell bash --fnm-dir \\\"$FNM_DIR\\\")\"",
        ...(exactNodeVersion
          ? [`fnm use --install-if-missing ${exactNodeVersion}`]
          : []),
        "corepack enable >/dev/null 2>&1 || true",
        "node -v",
        "pnpm install --frozen-lockfile --ignore-scripts",
      ].join(" && ");

      const bootstrap = await deps.docker.exec(container, [
        "bash",
        "-lc",
        bootstrapScript,
      ]);
      if (bootstrap.exitCode !== 0) {
        deps.emitEvent(runId, "validation_bootstrap_result", {
          exitCode: bootstrap.exitCode,
          stdout: truncateForEvent(bootstrap.stdout),
          stderr: truncateForEvent(bootstrap.stderr),
        });
        failures.push(
          [
            "Command: [bootstrap validation workspace]",
            `Stdout: ${bootstrap.stdout}`,
            `Stderr: ${bootstrap.stderr}`,
          ].join("\n")
        );
        return undefined;
      }
      deps.emitEvent(runId, "validation_bootstrap_result", {
        exitCode: bootstrap.exitCode,
        stdout: truncateForEvent(bootstrap.stdout),
        stderr: truncateForEvent(bootstrap.stderr),
      });

      for (const cmd of validationCommands) {
        deps.emitEvent(runId, "validation_command_start", { command: cmd });
        const wrapped = `cd ${SANDBOX_WORKDIR} && ${cmd}`;
        const result = await deps.docker.exec(container, ["bash", "-lc", wrapped]);
        deps.emitEvent(runId, "validation_command_result", {
          command: cmd,
          exitCode: result.exitCode,
          stdout: truncateForEvent(result.stdout),
          stderr: truncateForEvent(result.stderr),
        });
        if (result.exitCode !== 0) {
          failures.push(
            `Command: ${cmd}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`
          );
        }
      }
      return undefined;
    });

    if (failures.length === 0) {
      return { status: RunStatus.REVIEWING, error: undefined };
    }

    return {
      error: failures.join("\n---\n"),
    };
  };
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
