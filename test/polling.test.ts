import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { startPolling } from "../src/bot/polling.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("startPolling", () => {
  it("stops with fatal error on HTTP 404", async () => {
    globalThis.fetch = (async () =>
      new Response("Not Found", { status: 404 })) as typeof fetch;

    await assert.rejects(
      () =>
        startPolling({
          baseUrl: "https://api.telegram.org/bot",
          signal: new AbortController().signal,
          onUpdates: async () => {},
          timeout: 1,
        }),
      /getUpdates 404/
    );
  });

  it("stops with fatal error on Telegram API 401 payload", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 401,
          description: "Unauthorized",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    await assert.rejects(
      () =>
        startPolling({
          baseUrl: "https://api.telegram.org/bot",
          signal: new AbortController().signal,
          onUpdates: async () => {},
          timeout: 1,
        }),
      /Unauthorized/
    );
  });
});
