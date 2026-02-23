import type { RunStore } from "../store/runs.js";
import type { CompiledGraph } from "../api/server.js";
import type { NodeDeps } from "../graph/nodes/deps.js";
import type { PendingRevise } from "./callbacks.js";
import { startPolling } from "./polling.js";
import { dispatch } from "./handlers.js";

export interface BotConfig {
  botToken: string;
  chatId: string;
}

export interface BotDeps {
  runStore: RunStore;
  graph: CompiledGraph;
  nodeDeps: NodeDeps;
}

export interface Bot {
  start(): void;
  stop(): void;
}

export function createBot(config: BotConfig, deps: BotDeps): Bot {
  const baseUrl = `https://api.telegram.org/bot${config.botToken}`;
  const allowedChatId = Number(config.chatId);
  const pendingRevise: Map<number, PendingRevise> = new Map();

  let ac: AbortController | undefined;

  return {
    start() {
      if (ac) return;
      ac = new AbortController();

      const handlerDeps = {
        allowedChatId,
        callbackDeps: {
          graph: deps.graph,
          baseUrl,
          pendingRevise,
        },
        commandDeps: {
          runStore: deps.runStore,
          graph: deps.graph,
          nodeDeps: deps.nodeDeps,
          baseUrl,
          pendingRevise,
        },
      };

      startPolling({
        baseUrl,
        signal: ac.signal,
        onUpdates: async (updates) => {
          for (const u of updates) {
            try {
              await dispatch(u, handlerDeps);
            } catch (err) {
              console.error("[bot] dispatch error:", err);
            }
          }
        },
      }).catch((err) => {
        if (!ac?.signal.aborted) {
          console.error("[bot] polling stopped:", err);
        }
      });

      console.log("[bot] Telegram polling started");
    },

    stop() {
      if (!ac) return;
      ac.abort();
      ac = undefined;
      console.log("[bot] Telegram polling stopped");
    },
  };
}
