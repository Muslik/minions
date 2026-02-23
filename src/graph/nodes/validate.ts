import { RunStatus } from "../../domain/types.js";
import { WORKER_PROFILES } from "../../domain/constants.js";
import type { CodingState } from "../../domain/state.js";
import type { NodeDeps } from "./deps.js";

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
    const binds = [`${worktreePath}:/workspace:ro`];
    const failures: string[] = [];

    await deps.docker.withContainer(profile, binds, async (container) => {
      for (const cmd of validationCommands) {
        const result = await deps.docker.exec(container, [
          "sh",
          "-c",
          cmd,
        ]);
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
