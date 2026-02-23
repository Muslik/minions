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
        console.error(`[bot/polling] getUpdates ${res.status}`);
        await sleep(3000, signal);
        continue;
      }

      const data = (await res.json()) as TgGetUpdatesResult;
      if (!data.ok || !data.result.length) continue;

      offset = data.result[data.result.length - 1]!.update_id + 1;
      await onUpdates(data.result);
    } catch (err: unknown) {
      if (signal.aborted) return;
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
