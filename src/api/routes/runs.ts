import { Hono } from "hono";
import { z } from "zod";
import type { RunStatus } from "../../domain/types.js";
import type { AppDeps } from "../server.js";
import { launchRun } from "../../services/run-launcher.js";

const CreateRunSchema = z.object({
  ticketUrl: z.string().url().optional(),
  ticketKey: z.string().min(1).optional(),
  chatId: z.string().min(1).default("web"),
  requesterId: z.string().min(1).default("web"),
});

const RerunSchema = z.object({
  mode: z.enum(["full", "reuse_plan"]).default("full"),
  comment: z.string().optional(),
});

export type RunsAppDeps = AppDeps;

export function runsRoutes(appDeps: RunsAppDeps): Hono {
  const app = new Hono();
  const { runStore, graph } = appDeps;

  app.post("/coding", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = CreateRunSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { ticketKey, chatId, requesterId } = parsed.data;
    let { ticketUrl } = parsed.data;

    if (!ticketUrl && ticketKey) {
      ticketUrl = appDeps.config.jira.baseUrl + "/browse/" + ticketKey;
    }

    if (!ticketUrl) {
      return c.json({ error: "Either ticketUrl or ticketKey is required" }, 400);
    }

    const existingRun = appDeps.runStore.findActiveByTicketUrl(ticketUrl);
    if (existingRun) {
      return c.json({ error: "Active run exists", existingRun }, 409);
    }

    const runId = launchRun(
      { ticketUrl, chatId, requesterId },
      runStore,
      graph,
      appDeps.deps
    );

    return c.json({ runId }, 202);
  });

  app.get("/", (c) => {
    const status = c.req.query("status") as RunStatus | undefined;
    const _chatId = c.req.query("chatId");
    const limitStr = c.req.query("limit");
    const offsetStr = c.req.query("offset");
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const offset = offsetStr ? parseInt(offsetStr, 10) : undefined;

    let runs = runStore.list(status ? { status } : undefined);
    if (_chatId) {
      runs = runs.filter((r) => r.payload.chatId === _chatId);
    }
    if (offset) runs = runs.slice(offset);
    if (limit) runs = runs.slice(0, limit);

    return c.json(runs);
  });

  app.get("/:id/events", (c) => {
    const id = c.req.param("id");
    return c.json(runStore.listEvents(id));
  });

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const run = runStore.get(id);
    if (!run) return c.json({ error: "Not found" }, 404);
    return c.json(run);
  });

  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    const run = runStore.get(id);
    if (!run) return c.json({ error: "Not found" }, 404);
    runStore.delete(id);
    return new Response(null, { status: 204 });
  });

  app.post("/:id/rerun", async (c) => {
    const id = c.req.param("id");
    const run = runStore.get(id);
    if (!run) return c.json({ error: "Not found" }, 404);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const parsed = RerunSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const { mode, comment } = parsed.data;

    if (mode === "reuse_plan" && !run.plan?.trim()) {
      return c.json({ error: "Cannot reuse plan: source run has no plan" }, 400);
    }

    const existingRun = appDeps.runStore.findActiveByTicketUrl(run.payload.ticketUrl);
    if (existingRun && existingRun.id !== id) {
      return c.json({ error: "Active run exists", existingRun }, 409);
    }

    const runId = launchRun(
      {
        ticketUrl: run.payload.ticketUrl,
        chatId: run.payload.chatId,
        requesterId: run.payload.requesterId,
      },
      runStore,
      graph,
      appDeps.deps,
      mode === "reuse_plan"
        ? {
            plan: run.plan,
            resumeAction: "approve",
            resumeComment: comment?.trim() || undefined,
          }
        : undefined
    );

    return c.json({ runId, mode }, 202);
  });

  return app;
}
