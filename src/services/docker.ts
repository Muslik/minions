import Dockerode from "dockerode";
import type { DockerConfig } from "../config/schema.js";
import type { WorkerProfile } from "../domain/types.js";
import { DockerError } from "../domain/errors.js";

export class DockerService {
  private docker: Dockerode;
  private image: string;

  constructor(config: DockerConfig) {
    this.docker = new Dockerode({ socketPath: config.socketPath });
    this.image = config.registryPrefix
      ? `${config.registryPrefix}/${config.image}`
      : config.image;
  }

  async createContainer(
    profile: WorkerProfile,
    binds: string[],
    env?: string[],
    cmd?: string[]
  ): Promise<Dockerode.Container> {
    try {
      const nanoCpus = profile.cpu * 1e9;
      const memoryBytes = parseMemory(profile.memory);
      const container = await this.docker.createContainer({
        Image: this.image,
        Cmd: cmd ?? ["sh", "-lc", "while true; do sleep 3600; done"],
        Tty: false,
        AttachStdout: true,
        AttachStderr: true,
        Env: env,
        NetworkDisabled: profile.network === "none",
        HostConfig: {
          NanoCpus: nanoCpus,
          Memory: memoryBytes,
          NetworkMode: profile.network,
          ReadonlyRootfs: profile.readOnly,
          Binds: binds,
        },
      });
      return container;
    } catch (err) {
      throw new DockerError({
        message: `Failed to create container for role ${profile.role}`,
        cause: err,
      });
    }
  }

  async runScript(
    profile: WorkerProfile,
    binds: string[],
    script: string,
    env?: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const container = await this.createContainer(profile, binds, env, [
      "bash",
      "-lc",
      script,
    ]);
    try {
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      container.modem.demuxStream(
        stream,
        {
          write: (chunk: Buffer) => stdoutChunks.push(chunk),
        } as unknown as NodeJS.WritableStream,
        {
          write: (chunk: Buffer) => stderrChunks.push(chunk),
        } as unknown as NodeJS.WritableStream
      );
      const streamDone = waitForStreamEnd(stream);

      await container.start();
      const waitResult = await container.wait();
      await streamDone;

      return {
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: waitResult.StatusCode ?? -1,
      };
    } catch (err) {
      throw new DockerError({ message: "run script failed", cause: err });
    } finally {
      await this.removeContainer(container).catch(() => undefined);
    }
  }

  async exec(
    container: Dockerode.Container,
    cmd: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let attempt = 0;
    while (attempt < EXEC_MAX_ATTEMPTS) {
      attempt += 1;
      try {
        const result = await this.execOnce(container, cmd);
        if (attempt < EXEC_MAX_ATTEMPTS && isInitPipeFailureResult(result)) {
          console.warn(
            `[docker] transient exec init-p failure, retrying (${attempt}/${EXEC_MAX_ATTEMPTS - 1})`
          );
          await delay(EXEC_RETRY_DELAY_MS);
          continue;
        }
        return result;
      } catch (err) {
        const dockerErr =
          err instanceof DockerError
            ? err
            : new DockerError({ message: "exec failed", cause: err });
        if (attempt < EXEC_MAX_ATTEMPTS && isInitPipeError(dockerErr)) {
          console.warn(
            `[docker] transient exec error, retrying (${attempt}/${EXEC_MAX_ATTEMPTS - 1}): ${dockerErr.message}`
          );
          await delay(EXEC_RETRY_DELAY_MS);
          continue;
        }
        throw dockerErr;
      }
    }

    throw new DockerError({ message: "exec failed after retries" });
  }

  private async execOnce(
    container: Dockerode.Container,
    cmd: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
      });
      return await new Promise((resolve, reject) => {
        exec.start({ hijack: true, stdin: false }, (err, stream) => {
          if (err || !stream) {
            reject(
              new DockerError({ message: "exec start failed", cause: err })
            );
            return;
          }
          let stdout = "";
          let stderr = "";
          const stdoutChunks: Buffer[] = [];
          const stderrChunks: Buffer[] = [];
          container.modem.demuxStream(
            stream,
            {
              write: (chunk: Buffer) => stdoutChunks.push(chunk),
            } as unknown as NodeJS.WritableStream,
            {
              write: (chunk: Buffer) => stderrChunks.push(chunk),
            } as unknown as NodeJS.WritableStream
          );
          stream.on("end", () => {
            stdout = Buffer.concat(stdoutChunks).toString("utf-8");
            stderr = Buffer.concat(stderrChunks).toString("utf-8");
            exec.inspect((inspectErr, data) => {
              if (inspectErr || !data) {
                reject(
                  new DockerError({
                    message: "exec inspect failed",
                    cause: inspectErr,
                  })
                );
                return;
              }
              resolve({ stdout, stderr, exitCode: data.ExitCode ?? -1 });
            });
          });
          stream.on("error", (streamErr: Error) =>
            reject(
              new DockerError({ message: "exec stream error", cause: streamErr })
            )
          );
        });
      });
    } catch (err) {
      if (err instanceof DockerError) throw err;
      throw new DockerError({
        message: `exec failed: ${stringifyCause(err)}`,
        cause: err,
      });
    }
  }

  async removeContainer(container: Dockerode.Container): Promise<void> {
    try {
      await container.remove({ force: true });
    } catch (err) {
      throw new DockerError({ message: "Failed to remove container", cause: err });
    }
  }

  async withContainer<T>(
    profile: WorkerProfile,
    binds: string[],
    fn: (container: Dockerode.Container) => Promise<T>,
    env?: string[]
  ): Promise<T> {
    const container = await this.createContainer(profile, binds, env);
    try {
      await container.start();
      return await fn(container);
    } finally {
      await this.removeContainer(container).catch(() => undefined);
    }
  }
}

function parseMemory(mem: string): number {
  const lower = mem.toLowerCase();
  if (lower.endsWith("g")) return parseFloat(lower) * 1024 * 1024 * 1024;
  if (lower.endsWith("m")) return parseFloat(lower) * 1024 * 1024;
  if (lower.endsWith("k")) return parseFloat(lower) * 1024;
  return parseInt(lower, 10);
}

const EXEC_MAX_ATTEMPTS = 2;
const EXEC_RETRY_DELAY_MS = 200;

function isInitPipeFailureResult(result: {
  stdout: string;
  stderr: string;
  exitCode: number;
}): boolean {
  if (result.exitCode !== 126) return false;
  return isInitPipeText(`${result.stdout}\n${result.stderr}`);
}

function isInitPipeError(err: DockerError): boolean {
  return isInitPipeText(`${err.message}\n${stringifyCause(err.cause)}`);
}

function isInitPipeText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("init-p") &&
    lower.includes("broken pipe") &&
    lower.includes("unable to start container process")
  );
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForStreamEnd(stream: NodeJS.ReadableStream): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    stream.on("end", finish);
    stream.on("close", finish);
    stream.on("error", finish);
  });
}
