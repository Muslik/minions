import { Hono } from "hono";
import { z } from "zod";
import { Command } from "@langchain/langgraph";
import type { AppDeps } from "../server.js";

const ResumeBodySchema = z.object({
  action: z.enum(["approve", "revise", "cancel"]),
  comment: z.string().optional(),
});

export type ResumeAppDeps = AppDeps;

export function resumeRoutes(appDeps: ResumeAppDeps): Hono {
  const app = new Hono();
  const { runStore, graph } = appDeps;

  app.post("/:id/resume", async (c) => {
    const id = c.req.param("id");
    const run = runStore.get(id);
    if (!run) return c.json({ error: "Not found" }, 404);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = ResumeBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { action, comment } = parsed.data;

    graph
      .invoke(new Command({ resume: { action, comment } }), {
        configurable: { thread_id: id },
      })
      .then((finalState) => {
        runStore.updateStatus(id, finalState.status);
        if (finalState.context) runStore.updateContext(id, finalState.context);
        if (finalState.plan) runStore.updatePlan(id, finalState.plan);
      })
      .catch((err: unknown) => {
        console.error(`Graph resume ${id} failed:`, err);
        runStore.updateStatus(id, "FAILED" as any);
        runStore.addEvent(id, "error", { message: String(err) });
      });

    return c.json({ runId: id, action });
  });

  app.post("/:id/cancel", async (c) => {
    const id = c.req.param("id");
    const run = runStore.get(id);
    if (!run) return c.json({ error: "Not found" }, 404);

    graph
      .invoke(new Command({ resume: { action: "cancel", comment: "Cancelled via API" } }), {
        configurable: { thread_id: id },
      })
      .then((finalState) => {
        runStore.updateStatus(id, finalState.status);
      })
      .catch((err: unknown) => {
        console.error(`Graph cancel ${id} failed:`, err);
        runStore.updateStatus(id, "FAILED" as any);
      });

    return c.json({ runId: id, action: "cancel" });
  });

  return app;
}
