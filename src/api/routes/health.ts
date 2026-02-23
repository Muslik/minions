import { Hono } from "hono";

export function healthRoutes(): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/info", (c) => {
    return c.json({
      name: "minions",
      version: "0.1.0",
      uptime: process.uptime(),
    });
  });

  return app;
}
