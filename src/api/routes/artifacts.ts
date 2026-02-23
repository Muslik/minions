import { Hono } from "hono";
import { getArtifact, listArtifacts } from "../../services/artifacts.js";
import type { AppDeps } from "../server.js";

export type ArtifactsAppDeps = AppDeps;

function inferContentType(name: string): string {
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".ts") || name.endsWith(".js")) return "text/plain; charset=utf-8";
  return "text/plain; charset=utf-8";
}

export function artifactRoutes(appDeps: ArtifactsAppDeps): Hono {
  const app = new Hono();
  const { config } = appDeps;

  app.get("/:id/artifacts", (c) => {
    const id = c.req.param("id");
    const names = listArtifacts(config.storage.artifactsDir, id);
    return c.json(names);
  });

  app.get("/:id/artifacts/:name", (c) => {
    const id = c.req.param("id");
    const name = c.req.param("name");

    const content = getArtifact(config.storage.artifactsDir, id, name);
    if (content === null) {
      return c.json({ error: "Artifact not found" }, 404);
    }

    return new Response(content, {
      status: 200,
      headers: { "Content-Type": inferContentType(name) },
    });
  });

  return app;
}
