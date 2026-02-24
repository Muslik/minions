import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import type { OAuthTokenProvider } from "./auth.js";
import { createToolsForRole, type AgentRole } from "./tools.js";
import { loadTemplate, renderTemplate } from "./prompt.js";
import type { RunContext } from "../domain/types.js";
import type { AgentRecursionLimits } from "../config/schema.js";

function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "text" || b.type === "output_text")
      .map((b: any) => b.text ?? "")
      .join("\n")
      .trim();
  }
  return "";
}

const DEFAULT_ROLE_CONFIG: Record<AgentRole, { recursionLimit: number; reasoning?: string }> = {
  clarify: { recursionLimit: 80 },
  architect: { recursionLimit: 240, reasoning: "high" },
  coder: { recursionLimit: 120 },
  reviewer: { recursionLimit: 80 },
};

export class AgentFactory {
  private model: string;
  private baseUrl: string;
  private tokenProvider: OAuthTokenProvider;
  private promptsDir: string;
  private recursionLimits: AgentRecursionLimits;

  constructor(opts: {
    model: string;
    baseUrl: string;
    tokenProvider: OAuthTokenProvider;
    promptsDir: string;
    recursionLimits?: AgentRecursionLimits;
  }) {
    this.model = opts.model;
    this.baseUrl = opts.baseUrl;
    this.tokenProvider = opts.tokenProvider;
    this.promptsDir = opts.promptsDir;
    this.recursionLimits = opts.recursionLimits ?? {
      clarify: DEFAULT_ROLE_CONFIG.clarify.recursionLimit,
      architect: DEFAULT_ROLE_CONFIG.architect.recursionLimit,
      coder: DEFAULT_ROLE_CONFIG.coder.recursionLimit,
      reviewer: DEFAULT_ROLE_CONFIG.reviewer.recursionLimit,
    };
  }

  async runAgent(
    role: AgentRole,
    worktreePath: string,
    context: RunContext,
    extraVars?: Record<string, string>,
    onEvent?: (type: string, data: unknown) => void
  ): Promise<string> {
    const roleConfig = this.getRoleConfig(role);
    const apiKey = await this.tokenProvider.getAccessToken();

    const vars = buildTemplateVars(context, extraVars);
    const template = loadTemplate(this.promptsDir, role);
    const instructions = renderTemplate(template, vars);

    const llm = new ChatOpenAI({
      modelName: this.model,
      apiKey,
      useResponsesApi: true,
      streaming: true,
      zdrEnabled: true,
      modelKwargs: {
        instructions,
        ...(roleConfig.reasoning && { reasoning: { effort: roleConfig.reasoning } }),
      },
      configuration: {
        baseURL: this.baseUrl,
      },
    });

    const tools = createToolsForRole(role, worktreePath);
    const agent = createReactAgent({ llm, tools });

    let lastAiText = "";
    let seenCount = 1; // skip the initial HumanMessage
    onEvent?.("agent_runtime", {
      role,
      recursionLimit: roleConfig.recursionLimit,
      reasoning: roleConfig.reasoning ?? null,
    });

    try {
      for await (const chunk of await agent.stream(
        { messages: [new HumanMessage("proceed")] },
        { recursionLimit: roleConfig.recursionLimit }
      )) {
        const messages = (chunk as Record<string, any>).messages;
        if (!Array.isArray(messages)) continue;

        const newMsgs = messages.slice(seenCount);
        seenCount = messages.length;

        for (const msg of newMsgs) {
          const msgType = typeof msg._getType === "function" ? msg._getType() : "unknown";

          if (msgType === "ai") {
            if (msg.tool_calls?.length) {
              for (const tc of msg.tool_calls) {
                onEvent?.("tool_call", { tool: tc.name, input: tc.args });
              }
            }
            const text = extractText(msg.content);
            if (text) {
              lastAiText = text;
              onEvent?.("agent_text", { text: text.slice(0, 300) });
            }
          } else if (msgType === "tool") {
            const raw = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
            const output = raw.length > 1024 ? raw.slice(0, 1024) + "\u2026" : raw;
            onEvent?.("tool_result", { tool: msg.name, output });
          }
        }
      }
    } catch (err) {
      const detail = formatError(err);
      onEvent?.("agent_error", {
        role,
        recursionLimit: roleConfig.recursionLimit,
        message: detail,
      });
      throw new Error(
        `[agent:${role}] ${detail} (recursionLimit=${roleConfig.recursionLimit})`,
        { cause: err }
      );
    }

    return lastAiText;
  }

  private getRoleConfig(role: AgentRole): { recursionLimit: number; reasoning?: string } {
    const defaults = DEFAULT_ROLE_CONFIG[role];
    const customLimit = this.recursionLimits[role];
    return {
      recursionLimit:
        typeof customLimit === "number" && Number.isFinite(customLimit) && customLimit > 0
          ? customLimit
          : defaults.recursionLimit,
      reasoning: defaults.reasoning,
    };
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name?.trim() ?? "Error";
    const message = err.message?.trim() ?? "";
    return message ? `${name}: ${message}` : name;
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
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
