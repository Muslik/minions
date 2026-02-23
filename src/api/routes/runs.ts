import { Hono } from "hono";
import { z } from "zod";
import { RunStatus } from "../../domain/types.js";
import type { AppDeps } from "../server.js";

const CreateRunSchema = z.object({
  ticketUrl: z.string().url(),
  chatId: z.string().min(1),
  requesterId: z.string().min(1),
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

    const { ticketUrl, chatId, requesterId } = parsed.data;
    const runId = runStore.create({ ticketUrl, chatId, requesterId });

    // Invoke graph in background - do not await
    graph
      .invoke(
        {
          runId,
          payload: { ticketUrl, chatId, requesterId },
          context: { runId, ticketUrl, chatId, requesterId },
        },
        { configurable: { thread_id: runId } }
      )
      .then((finalState) => {
        appDeps.runStore.updateStatus(runId, finalState.status);
        if (finalState.context) {
          appDeps.runStore.updateContext(runId, finalState.context);
        }
        if (finalState.plan) {
          appDeps.runStore.updatePlan(runId, finalState.plan);
        }
      })
      .catch(async (err: unknown) => {
        console.error(`Graph run ${runId} failed:`, err);
        appDeps.runStore.updateStatus(runId, RunStatus.FAILED);
        appDeps.runStore.addEvent(runId, "error", { message: String(err) });
        await appDeps.deps.notifier.notify({
          runId,
          status: "failed",
          message: String(err),
          chatId,
          requesterId,
          ticketKey: ticketUrl.split("/").pop(),
          ticketUrl,
        });
      });

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

  return app;
}
