import type { WorkerProfile } from "./types.js";

export const MAX_VALIDATION_LOOPS = 2;
export const MAX_REVIEWER_LOOPS = 2;
export const CI_POLL_INTERVAL_MS = 30_000;
export const CI_POLL_MAX_ATTEMPTS = 40;

export const WORKER_PROFILES: Record<string, WorkerProfile> = {
  validator: {
    role: "validator",
    cpu: 2,
    memory: "4g",
    network: "bridge",
    readOnly: false,
    timeoutMs: 300_000,
  },
};
