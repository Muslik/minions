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
    env?: string[]
  ): Promise<Dockerode.Container> {
    try {
      const nanoCpus = profile.cpu * 1e9;
      const memoryBytes = parseMemory(profile.memory);
      const container = await this.docker.createContainer({
        Image: this.image,
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

  async exec(
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
      throw new DockerError({ message: "exec failed", cause: err });
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
