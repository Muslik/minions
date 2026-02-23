import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const REFRESH_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours, matching Codex CLI
const REFRESH_BUFFER_MS = 60_000; // 60s early refresh
const REFRESH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

interface AuthFile {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  last_refresh?: number;
}

export class OAuthTokenProvider {
  private authDir: string;
  private cached: AuthFile | null = null;

  constructor(authDir: string) {
    this.authDir = authDir;
  }

  async getAccessToken(): Promise<string> {
    const tokens = this.loadTokens();

    const now = Date.now();
    const lastRefresh = tokens.last_refresh ?? 0;
    const expiresAt = lastRefresh + REFRESH_INTERVAL_MS;

    if (lastRefresh > 0 && now < expiresAt - REFRESH_BUFFER_MS) {
      return tokens.access_token;
    }

    return this.refresh(tokens);
  }

  private loadTokens(): AuthFile {
    if (this.cached) return this.cached;

    const authPath = join(this.authDir, "auth.json");
    const raw = readFileSync(authPath, "utf-8");
    const tokens = JSON.parse(raw) as AuthFile;
    this.cached = tokens;
    return tokens;
  }

  private async refresh(tokens: AuthFile): Promise<string> {
    const response = await fetch(REFRESH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        scope: "openid profile email",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OAuth refresh failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
    };

    if (!data.access_token) {
      throw new Error("OAuth refresh returned no access_token");
    }

    const updated: AuthFile = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? tokens.refresh_token,
      id_token: data.id_token ?? tokens.id_token,
      last_refresh: Date.now(),
    };

    const authPath = join(this.authDir, "auth.json");
    mkdirSync(this.authDir, { recursive: true });
    writeFileSync(authPath, JSON.stringify(updated, null, 2), "utf-8");

    this.cached = updated;
    return updated.access_token;
  }
}
