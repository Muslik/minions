import type { BitbucketConfig } from "../config/schema.js";
import type { BuildStatus } from "../domain/types.js";
import { BitbucketError } from "../domain/errors.js";

interface CreatePRParams {
  projectKey: string;
  repoSlug: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}

interface BitbucketPRResponse {
  links: {
    self: Array<{ href: string }>;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BitbucketService {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: BitbucketConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.authHeader = `Bearer ${config.token}`;
  }

  async createPR(params: CreatePRParams): Promise<string> {
    const { projectKey, repoSlug, sourceBranch, targetBranch, title, description } =
      params;
    const url = `${this.baseUrl}/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests`;
    const body = JSON.stringify({
      title,
      description,
      fromRef: { id: `refs/heads/${sourceBranch}` },
      toRef: { id: `refs/heads/${targetBranch}` },
      open: true,
      closed: false,
      locked: false,
    });

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(1000 * attempt);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: this.authHeader,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          lastError = new BitbucketError({
            message: `Bitbucket API returned ${res.status}: ${text}`,
          });
          continue;
        }
        const data = (await res.json()) as BitbucketPRResponse;
        const prUrl = data.links.self[0]?.href;
        if (!prUrl) {
          throw new BitbucketError({ message: "PR URL missing from response" });
        }
        return prUrl;
      } catch (err) {
        if (err instanceof BitbucketError) throw err;
        lastError = err;
      }
    }
    const causeMsg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new BitbucketError({
      message: `Failed to create PR after 3 attempts: ${causeMsg}`,
      cause: lastError,
    });
  }

  async getCommitBuildStatus(commitHash: string): Promise<BuildStatus[]> {
    const url = `${this.baseUrl}/rest/build-status/1.0/commits/${commitHash}`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BitbucketError({
        message: `Build status API returned ${res.status}: ${text}`,
      });
    }
    const data = (await res.json()) as { values: BuildStatus[] };
    return data.values ?? [];
  }
}
