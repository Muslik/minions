import { serve } from "@hono/node-server";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { loadConfig } from "./config/loader.js";
import { initDb } from "./store/db.js";
import { RunStore } from "./store/runs.js";
import { createCheckpointer } from "./store/checkpoints.js";
import { buildRuntime } from "./effect/runtime.js";
import { compileCodingGraph } from "./graph/coding.js";
import { createApp } from "./api/server.js";
import { createBot } from "./bot/index.js";
import { EventBus } from "./services/event-bus.js";
import { resolveTelegramConfig } from "./services/telegram-config.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Ensure storage directories exist
  mkdirSync(dirname(config.storage.dbPath), { recursive: true });
  mkdirSync(config.storage.artifactsDir, { recursive: true });
  mkdirSync(config.storage.reposDir, { recursive: true });
  mkdirSync(config.storage.workspacesDir, { recursive: true });

  // Initialize SQLite database for run state
  const db = initDb(config.storage.dbPath);
  const eventBus = new EventBus();
  const runStore = new RunStore(db, eventBus);

  // Initialize checkpoint store for LangGraph
  const checkpointer = createCheckpointer(
    config.storage.dbPath + ".checkpoints"
  );

  // Build service layer
  const { deps, cleanup } = buildRuntime(config, runStore);

  // Compile the LangGraph coding graph
  const graph = compileCodingGraph(deps, checkpointer);

  // Build Hono app
  const app = createApp({ runStore, graph, config, deps, eventBus });

  // Start Telegram bot only when configured.
  const telegram = resolveTelegramConfig(
    config.notifier.telegram.botToken,
    config.notifier.telegram.chatId
  );
  let bot: ReturnType<typeof createBot> | undefined;
  if (telegram.enabled) {
    bot = createBot(
      {
        botToken: telegram.botToken,
        chatId: telegram.chatId,
      },
      { runStore, graph, nodeDeps: deps }
    );
    bot.start();
  } else {
    console.warn(`[bot] Telegram polling disabled: ${telegram.reason}`);
  }

  // Start HTTP server
  const server = serve(
    {
      fetch: app.fetch,
      hostname: config.server.host,
      port: config.server.port,
    },
    (info) => {
      console.log(
        `Minions orchestrator listening on ${info.address}:${info.port}`
      );
    }
  );

  // Graceful shutdown
  const shutdown = () => {
    console.log("Shutting down...");
    bot?.stop();
    cleanup();
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(console.error);
