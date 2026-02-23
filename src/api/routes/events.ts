import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppDeps } from '../server.js';

export function eventsRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get('/stream', (c) => {
    return streamSSE(c, async (stream) => {
      const onStatus = (event: any) => {
        stream.writeSSE({ data: JSON.stringify({ type: 'status', ...event }), event: 'status' });
      };
      const onEvent = (event: any) => {
        stream.writeSSE({ data: JSON.stringify({ type: 'event', ...event }), event: 'run-event' });
      };

      deps.eventBus.on('status', onStatus);
      deps.eventBus.on('event', onEvent);

      const keepAlive = setInterval(() => {
        stream.writeSSE({ data: '', event: 'ping' });
      }, 30_000);

      stream.onAbort(() => {
        deps.eventBus.off('status', onStatus);
        deps.eventBus.off('event', onEvent);
        clearInterval(keepAlive);
      });

      await new Promise(() => {});
    });
  });

  return app;
}
