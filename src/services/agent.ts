import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import type { OAuthTokenProvider } from "./auth.js";
import { createToolsForRole, type AgentRole } from "./tools.js";
import { loadTemplate, renderTemplate } from "./prompt.js";
import type { RunContext } from "../domain/types.js";

const RECURSION_LIMITS: Record<AgentRole, number> = {
  architect: 40,
  coder: 80,
  reviewer: 40,
};

export class AgentFactory {
  private model: string;
  private baseUrl: string;
  private tokenProvider: OAuthTokenProvider;
  private promptsDir: string;

  constructor(opts: {
    model: string;
    baseUrl: string;
    tokenProvider: OAuthTokenProvider;
    promptsDir: string;
  }) {
    this.model = opts.model;
    this.baseUrl = opts.baseUrl;
    this.tokenProvider = opts.tokenProvider;
    this.promptsDir = opts.promptsDir;
  }

  async runAgent(
    role: AgentRole,
    worktreePath: string,
    context: RunContext,
    extraVars?: Record<string, string>
  ): Promise<string> {
    const apiKey = await this.tokenProvider.getAccessToken();

    const vars = buildTemplateVars(context, extraVars);
    const template = loadTemplate(this.promptsDir, role);
    const instructions = renderTemplate(template, vars);

    const llm = new ChatOpenAI({
      modelName: this.model,
      apiKey,
      useResponsesApi: true,
      streaming: true,
      modelKwargs: { store: false, instructions },
      configuration: {
        baseURL: this.baseUrl,
      },
    });

    const tools = createToolsForRole(role, worktreePath);
    const agent = createReactAgent({ llm, tools });

    const result = await agent.invoke(
      {
        messages: [new HumanMessage("proceed")],
      },
      { recursionLimit: RECURSION_LIMITS[role] }
    );

    const messages = result.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!;
      if (msg._getType() !== "ai") continue;
      const text = msg.text?.trim();
      if (text) return text;
    }

    return "";
  }
}

function buildTemplateVars(
  context: RunContext,
  extraVars?: Record<string, string>
): Record<string, string> {
  const vars: Record<string, string> = {};

  if (context.jiraIssue) {
    vars["ticketKey"] = context.jiraIssue.key;
    vars["ticketSummary"] = context.jiraIssue.summary;
    vars["ticketDescription"] = context.jiraIssue.description;
    if (context.jiraIssue.components.length) {
      vars["ticketComponents"] = context.jiraIssue.components.join(", ");
    }
    if (context.jiraIssue.labels.length) {
      vars["ticketLabels"] = context.jiraIssue.labels.join(", ");
    }
  }

  if (context.repoSlug) vars["repoSlug"] = context.repoSlug;
  if (context.repoDescription) vars["repoDescription"] = context.repoDescription;
  if (context.repoConventions) vars["repoConventions"] = context.repoConventions;
  if (context.targetBranch) vars["targetBranch"] = context.targetBranch;

  if (context.validationCommands?.length) {
    vars["validationCommands"] = context.validationCommands.join("\n");
  }

  if (context.confluencePages?.length) {
    vars["confluenceContext"] = context.confluencePages
      .map((p) => `### ${p.title}\n${p.content}`)
      .join("\n\n");
  }

  if (context.loopThreads?.length) {
    vars["loopContext"] = context.loopThreads.join("\n---\n");
  }

  if (context.figmaLinks?.length) {
    vars["figmaLinks"] = context.figmaLinks.join("\n");
  }

  if (extraVars) Object.assign(vars, extraVars);

  return vars;
}
