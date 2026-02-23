import { Annotation } from "@langchain/langgraph";
import type { RunStatus, RunPayload, RunContext, ResumeAction } from "./types.js";

export const CodingStateAnnotation = Annotation.Root({
  runId: Annotation<string>({
    default: () => "",
    reducer: (_prev, next) => next,
  }),
  status: Annotation<RunStatus>({
    default: () => "RECEIVED" as RunStatus,
    reducer: (_prev, next) => next,
  }),
  payload: Annotation<RunPayload>({
    default: () => ({ ticketUrl: "", chatId: "", requesterId: "" }),
    reducer: (_prev, next) => next,
  }),
  context: Annotation<RunContext>({
    default: () => ({ runId: "", ticketUrl: "", chatId: "", requesterId: "" }),
    reducer: (_prev, next) => next,
  }),
  plan: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  codeIterations: Annotation<number>({
    default: () => 0,
    reducer: (prev, next) => prev + next,
  }),
  reviewIterations: Annotation<number>({
    default: () => 0,
    reducer: (prev, next) => prev + next,
  }),
  error: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  escalationReason: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  resumeAction: Annotation<ResumeAction | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  resumeComment: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  questions: Annotation<string[] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  answers: Annotation<string[] | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  ciStatus: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  ciBuildUrl: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
});

export type CodingState = typeof CodingStateAnnotation.State;
