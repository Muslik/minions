import { readFileSync } from "fs";
import { join } from "path";
import { RunStatus } from "../../domain/types.js";
import { WORKER_PROFILES } from "../../domain/constants.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

const SOURCE_WORKDIR = "/workspace";
const SANDBOX_WORKDIR = "/tmp/workspace";

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
    const pnpmExecutable = exactNodeVersion
      ? `npx -y node@${exactNodeVersion} /usr/local/bin/pnpm`
      : "pnpm";

    await deps.docker.withContainer(profile, binds, async (container) => {
      const bootstrapScript = [
        "set -eu",
        `rm -rf ${SANDBOX_WORKDIR}`,
        `mkdir -p ${SANDBOX_WORKDIR}`,
        `cp -a ${SOURCE_WORKDIR}/. ${SANDBOX_WORKDIR}`,
        `cd ${SANDBOX_WORKDIR}`,
        "corepack enable >/dev/null 2>&1 || true",
        `${pnpmExecutable} install --frozen-lockfile --ignore-scripts`,
      ].join(" && ");

      const bootstrap = await deps.docker.exec(container, [
        "sh",
        "-c",
        bootstrapScript,
      ]);
      if (bootstrap.exitCode !== 0) {
        failures.push(
          [
            "Command: [bootstrap validation workspace]",
            `Stdout: ${bootstrap.stdout}`,
            `Stderr: ${bootstrap.stderr}`,
          ].join("\n")
        );
        return undefined;
      }

      for (const cmd of validationCommands) {
        const prepared = rewritePnpmCommand(cmd, pnpmExecutable);
        const wrapped = `cd ${SANDBOX_WORKDIR} && ${prepared}`;
        const result = await deps.docker.exec(container, ["sh", "-c", wrapped]);
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

function rewritePnpmCommand(command: string, pnpmExecutable: string): string {
  if (pnpmExecutable === "pnpm") return command;
  const match = command.match(
    /^\s*((?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*)pnpm\b(.*)$/
  );
  if (!match) return command;
  const envPrefix = match[1] ?? "";
  const rest = match[2] ?? "";
  return `${envPrefix}${pnpmExecutable}${rest}`;
}
