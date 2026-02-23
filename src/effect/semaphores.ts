import { Effect } from "effect";

// Semaphore limiting concurrency for validation (1 at a time)
export const validationSemaphore: Effect.Semaphore =
  Effect.unsafeMakeSemaphore(1);

// Semaphore limiting concurrency for worker containers (2 at a time)
export const workerSemaphore: Effect.Semaphore =
  Effect.unsafeMakeSemaphore(2);
