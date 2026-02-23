import { Hono } from "hono";
import type { RunStore } from "../store/runs.js";
import type { NodeDeps } from "../graph/nodes/deps.js";
import type { OrchestratorConfig } from "../config/schema.js";
import type { compileCodingGraph } from "../graph/coding.js";
import { runsRoutes } from "./routes/runs.js";
import { resumeRoutes } from "./routes/resume.js";
import { artifactRoutes } from "./routes/artifacts.js";
import { healthRoutes } from "./routes/health.js";

export type CompiledGraph = ReturnType<typeof compileCodingGraph>;

export interface AppDeps {
  runStore: RunStore;
  graph: CompiledGraph;
  config: OrchestratorConfig;
  deps: NodeDeps;
}

export function createApp(appDeps: AppDeps): Hono {
  const app = new Hono();

  // Mount routes
  app.route("/", healthRoutes());
  app.route("/api/v1/runs", runsRoutes(appDeps));
  app.route("/api/v1/runs", resumeRoutes(appDeps));
  app.route("/api/v1/runs", artifactRoutes(appDeps));

  return app;
}
