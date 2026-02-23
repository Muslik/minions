import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export function saveArtifact(
  artifactsDir: string,
  runId: string,
  name: string,
  content: string
): void {
  const dir = join(artifactsDir, runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content, "utf-8");
}

export function getArtifact(
  artifactsDir: string,
  runId: string,
  name: string
): string | null {
  const filePath = join(artifactsDir, runId, name);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

export function listArtifacts(artifactsDir: string, runId: string): string[] {
  const dir = join(artifactsDir, runId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}
