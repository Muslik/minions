import { interrupt } from "@langchain/langgraph";
import type { CodingState } from "../../domain/state.js";
import type { ResumeAction } from "../../domain/types.js";
import type { NodeDeps } from "./deps.js";

interface ResumePayload {
  action: ResumeAction;
  comment?: string;
}

export function createAwaitApprovalNode(deps: NodeDeps) {
  return async function awaitApprovalNode(
    state: CodingState
  ): Promise<Partial<CodingState>> {
    const { runId } = state.context;
    const planPreview = state.plan?.slice(0, 500) ?? "(no plan)";

    await deps.notifier.notify({
      runId,
      status: "awaiting_approval",
      message: planPreview,
      data: { plan: state.plan },
    });

    const resume = interrupt<{ plan: string | undefined }, ResumePayload>({
      plan: state.plan,
    });

    return {
      resumeAction: resume.action,
      resumeComment: resume.comment,
    };
  };
}
