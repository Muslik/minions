import type { TgGetUpdatesResult, TgUpdate } from "./types.js";

export interface PollingOptions {
  baseUrl: string;
  onUpdates: (updates: TgUpdate[]) => Promise<void>;
  signal: AbortSignal;
  timeout?: number;
}

export async function startPolling(opts: PollingOptions): Promise<void> {
  const { baseUrl, onUpdates, signal, timeout = 30 } = opts;
  let offset = 0;

  while (!signal.aborted) {
    try {
      const url = `${baseUrl}/getUpdates?offset=${offset}&timeout=${timeout}`;
      const res = await fetch(url, { signal });
      if (!res.ok) {
        const body = truncate(await res.text().catch(() => ""));
        const message = `[bot/polling] getUpdates ${res.status}${body ? `: ${body}` : ""}`;
        if (res.status === 401 || res.status === 404) {
          throw new FatalPollingError(message);
        }
        console.error(message);
        await sleep(3000, signal);
        continue;
      }

      const data = (await res.json()) as TgGetUpdatesResult;
      if (!data.ok) {
        const description = data.description ? `: ${truncate(data.description)}` : "";
        const message = `[bot/polling] getUpdates error${description}`;
        if (data.error_code === 401 || data.error_code === 404) {
          throw new FatalPollingError(message);
        }
        console.error(message);
        await sleep(3000, signal);
        continue;
      }
      if (!data.ok || !data.result.length) continue;

      offset = data.result[data.result.length - 1]!.update_id + 1;
      await onUpdates(data.result);
    } catch (err: unknown) {
      if (signal.aborted) return;
      if (err instanceof FatalPollingError) {
        throw err;
      }
      console.error("[bot/polling] error:", err);
      await sleep(3000, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function truncate(text: string, max = 300): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

class FatalPollingError extends Error {}
