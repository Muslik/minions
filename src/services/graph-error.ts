import { RunStatus } from "../domain/types.js";

export interface GraphFailureClassification {
  runStatus: RunStatus;
  notifyStatus: "failed" | "escalated";
  eventType: "error" | "escalation";
  errorCode?: "GRAPH_RECURSION_LIMIT";
  message: string;
}

const RECURSION_PATTERNS = [
  /\bGRAPH_RECURSION_LIMIT\b/i,
  /\brecursion limit of \d+ reached\b/i,
];

export function classifyGraphFailure(err: unknown): GraphFailureClassification {
  const message = formatGraphError(err);
  const isRecursion = isGraphRecursionLimitError(message);

  if (isRecursion) {
    return {
      runStatus: RunStatus.ESCALATED,
      notifyStatus: "escalated",
      eventType: "escalation",
      errorCode: "GRAPH_RECURSION_LIMIT",
      message,
    };
  }

  return {
    runStatus: RunStatus.FAILED,
    notifyStatus: "failed",
    eventType: "error",
    message,
  };
}

export function isGraphRecursionLimitError(message: string): boolean {
  return RECURSION_PATTERNS.some((pattern) => pattern.test(message));
}

export function formatGraphError(err: unknown): string {
  if (err instanceof Error) {
    const text = `${err.name}: ${err.message}`.trim();
    return text.length > 0 ? text : "Unknown graph error";
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

