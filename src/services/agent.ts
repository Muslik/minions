import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import type { OAuthTokenProvider } from "./auth.js";
import { createToolsForRole, type AgentRole } from "./tools.js";
import { loadTemplate, renderTemplate } from "./prompt.js";
import type { RunContext } from "../domain/types.js";

const ROLE_CONFIG: Record<AgentRole, { recursionLimit: number; reasoning?: string }> = {
  clarify:   { recursionLimit: 20, reasoning: "xhigh" },
  architect: { recursionLimit: 40, reasoning: "xhigh" },
  coder:     { recursionLimit: 80 },
  reviewer:  { recursionLimit: 40 },
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
    extraVars?: Record<string, string>,
    onEvent?: (type: string, data: unknown) => void
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
      modelKwargs: { instructions, ...(ROLE_CONFIG[role].reasoning && { reasoning: { effort: ROLE_CONFIG[role].reasoning } }) },
      configuration: {
        baseURL: this.baseUrl,
      },
    });

    const tools = createToolsForRole(role, worktreePath);
    const agent = createReactAgent({ llm, tools });

    let lastAiText = "";

    for await (const chunk of await agent.stream(
      { messages: [new HumanMessage("proceed")] },
      { recursionLimit: ROLE_CONFIG[role].recursionLimit }
    )) {
      if ("agent" in chunk) {
        for (const msg of (chunk as Record<string, any>).agent.messages) {
          if (msg._getType() === "ai") {
            if (msg.tool_calls?.length) {
              for (const tc of msg.tool_calls) {
                onEvent?.("tool_call", { tool: tc.name, input: tc.args });
              }
            }
            const text = (typeof msg.content === "string" ? msg.content : "").trim();
            if (text) lastAiText = text;
          }
        }
      }
      if ("tools" in chunk) {
        for (const msg of (chunk as Record<string, any>).tools.messages) {
          const raw = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          const output = raw.length > 1024 ? raw.slice(0, 1024) + "\u2026" : raw;
          onEvent?.("tool_result", { tool: msg.name, output });
        }
      }
    }

    return lastAiText;
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
