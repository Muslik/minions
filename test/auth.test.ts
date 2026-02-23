import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { OAuthTokenProvider } from "../src/services/auth.ts";

let tmpDir: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "minions-auth-test-"));
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeAuth(dir: string, data: Record<string, unknown>): void {
  writeFileSync(join(dir, "auth.json"), JSON.stringify(data), "utf-8");
}

function readAuth(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, "auth.json"), "utf-8"));
}

describe("OAuthTokenProvider", () => {
  describe("cached token (not expired)", () => {
    it("returns access_token without fetching when last_refresh is recent", async () => {
      const authDir = mkdtempSync(join(tmpDir, "fresh-"));
      writeAuth(authDir, {
        access_token: "fresh-token",
        refresh_token: "rt-1",
        last_refresh: Date.now(),
      });

      const provider = new OAuthTokenProvider(authDir);
      const token = await provider.getAccessToken();

      assert.equal(token, "fresh-token");
    });

    it("returns same cached token on second call", async () => {
      const authDir = mkdtempSync(join(tmpDir, "cached-"));
      writeAuth(authDir, {
        access_token: "cached-tok",
        refresh_token: "rt-2",
        last_refresh: Date.now(),
      });

      const provider = new OAuthTokenProvider(authDir);
      const t1 = await provider.getAccessToken();
      const t2 = await provider.getAccessToken();

      assert.equal(t1, "cached-tok");
      assert.equal(t2, "cached-tok");
    });
  });

  describe("refresh trigger", () => {
    it("refreshes when last_refresh is missing (first use after codex login)", async () => {
      const authDir = mkdtempSync(join(tmpDir, "no-ts-"));
      writeAuth(authDir, {
        access_token: "old-token",
        refresh_token: "rt-3",
      });

      const originalFetch = globalThis.fetch;
      let fetchCalled = false;

      globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
        fetchCalled = true;

        const body = JSON.parse(init?.body as string);
        assert.equal(body.client_id, "app_EMoamEEZ73f0CkXaXp7hrann");
        assert.equal(body.grant_type, "refresh_token");
        assert.equal(body.refresh_token, "rt-3");
        assert.equal(body.scope, "openid profile email");

        return new Response(
          JSON.stringify({
            access_token: "new-token",
            refresh_token: "rt-3-new",
            id_token: "id-1",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const provider = new OAuthTokenProvider(authDir);
        const token = await provider.getAccessToken();

        assert.equal(fetchCalled, true, "fetch should have been called");
        assert.equal(token, "new-token");

        // Verify tokens persisted
        const persisted = readAuth(authDir);
        assert.equal(persisted["access_token"], "new-token");
        assert.equal(persisted["refresh_token"], "rt-3-new");
        assert.equal(persisted["id_token"], "id-1");
        assert.ok(
          typeof persisted["last_refresh"] === "number" &&
            persisted["last_refresh"]! > 0,
          "last_refresh should be set"
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("refreshes when token is older than 8 hours", async () => {
      const authDir = mkdtempSync(join(tmpDir, "expired-"));
      const nineHoursAgo = Date.now() - 9 * 60 * 60 * 1000;
      writeAuth(authDir, {
        access_token: "expired-token",
        refresh_token: "rt-4",
        last_refresh: nineHoursAgo,
      });

      const originalFetch = globalThis.fetch;
      let fetchCalled = false;

      globalThis.fetch = async () => {
        fetchCalled = true;
        return new Response(
          JSON.stringify({ access_token: "refreshed-token" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      try {
        const provider = new OAuthTokenProvider(authDir);
        const token = await provider.getAccessToken();

        assert.equal(fetchCalled, true);
        assert.equal(token, "refreshed-token");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws when refresh endpoint returns error", async () => {
      const authDir = mkdtempSync(join(tmpDir, "fail-"));
      writeAuth(authDir, {
        access_token: "old",
        refresh_token: "rt-5",
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response("Unauthorized", { status: 401, statusText: "Unauthorized" });

      try {
        const provider = new OAuthTokenProvider(authDir);
        await assert.rejects(
          () => provider.getAccessToken(),
          (err: Error) => {
            assert.ok(err.message.includes("401"));
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws when refresh returns no access_token", async () => {
      const authDir = mkdtempSync(join(tmpDir, "no-at-"));
      writeAuth(authDir, {
        access_token: "old",
        refresh_token: "rt-6",
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ refresh_token: "new-rt" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      try {
        const provider = new OAuthTokenProvider(authDir);
        await assert.rejects(
          () => provider.getAccessToken(),
          (err: Error) => {
            assert.ok(err.message.includes("no access_token"));
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("preserves existing refresh_token if server omits it", async () => {
      const authDir = mkdtempSync(join(tmpDir, "keep-rt-"));
      writeAuth(authDir, {
        access_token: "old",
        refresh_token: "original-rt",
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ access_token: "new-at" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      try {
        const provider = new OAuthTokenProvider(authDir);
        await provider.getAccessToken();

        const persisted = readAuth(authDir);
        assert.equal(persisted["refresh_token"], "original-rt");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("file errors", () => {
    it("throws when auth.json does not exist", async () => {
      const authDir = mkdtempSync(join(tmpDir, "missing-"));
      const provider = new OAuthTokenProvider(join(authDir, "nonexistent"));

      await assert.rejects(() => provider.getAccessToken());
    });
  });
});
