import { Data } from "effect";

export class HydrationError extends Data.TaggedError("HydrationError")<{
  message: string;
  cause?: unknown;
}> {}

export class DockerError extends Data.TaggedError("DockerError")<{
  message: string;
  cause?: unknown;
}> {}

export class GitError extends Data.TaggedError("GitError")<{
  message: string;
  cause?: unknown;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  message: string;
  cause?: unknown;
}> {}

export class ReviewRejectError extends Data.TaggedError("ReviewRejectError")<{
  message: string;
  cause?: unknown;
}> {}

export class BitbucketError extends Data.TaggedError("BitbucketError")<{
  message: string;
  cause?: unknown;
}> {}

export class JiraError extends Data.TaggedError("JiraError")<{
  message: string;
  cause?: unknown;
}> {}

export class EscalationError extends Data.TaggedError("EscalationError")<{
  message: string;
  cause?: unknown;
}> {}

export class TimeoutError extends Data.TaggedError("TimeoutError")<{
  message: string;
  cause?: unknown;
}> {}
