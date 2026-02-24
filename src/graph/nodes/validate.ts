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

    await deps.docker.withContainer(profile, binds, async (container) => {
      const bootstrapScript = [
        "set -eu",
        `rm -rf ${SANDBOX_WORKDIR}`,
        `mkdir -p ${SANDBOX_WORKDIR}`,
        `cp -a ${SOURCE_WORKDIR}/. ${SANDBOX_WORKDIR}`,
        `cd ${SANDBOX_WORKDIR}`,
        "corepack enable >/dev/null 2>&1 || true",
        "pnpm install --frozen-lockfile --ignore-scripts",
      ].join(" && ");

      const bootstrap = await deps.docker.exec(container, ["sh", "-c", bootstrapScript]);
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
        const wrapped = `cd ${SANDBOX_WORKDIR} && ${cmd}`;
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
