import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { RunStore } from "../store/runs.js";
import type { NodeDeps } from "../graph/nodes/deps.js";
import type { OrchestratorConfig } from "../config/schema.js";
import type { compileCodingGraph } from "../graph/coding.js";
import type { EventBus } from "../services/event-bus.js";
import { runsRoutes } from "./routes/runs.js";
import { resumeRoutes } from "./routes/resume.js";
import { artifactRoutes } from "./routes/artifacts.js";
import { healthRoutes } from "./routes/health.js";
import { eventsRoutes } from "./routes/events.js";

export type CompiledGraph = ReturnType<typeof compileCodingGraph>;

export interface AppDeps {
  runStore: RunStore;
  graph: CompiledGraph;
  config: OrchestratorConfig;
  deps: NodeDeps;
  eventBus: EventBus;
}

export function createApp(appDeps: AppDeps): Hono {
  const app = new Hono();

  // Mount routes
  app.route("/", healthRoutes());
  app.route("/api/v1/runs", runsRoutes(appDeps));
  app.route("/api/v1/runs", resumeRoutes(appDeps));
  app.route("/api/v1/runs", artifactRoutes(appDeps));
  app.route("/api/v1/events", eventsRoutes(appDeps));

  // Serve static UI files
  app.use("/*", serveStatic({ root: "./ui/dist" }));
  app.get("*", serveStatic({ root: "./ui/dist", path: "index.html" }));

  return app;
}
