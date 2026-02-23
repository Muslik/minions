import type { JiraConfig } from "../config/schema.js";
import type { JiraIssue } from "../domain/types.js";
import { JiraError } from "../domain/errors.js";

export interface JiraTransition {
  id: string;
  name: string;
}

const FIGMA_RE = /https:\/\/www\.figma\.com\/[^\s"')]+/g;

function parseTicketKey(ticketUrl: string): string {
  const url = new URL(ticketUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const key = segments[segments.length - 1];
  if (!key || !/^[A-Z]+-\d+$/.test(key)) {
    throw new JiraError({
      message: `Cannot parse Jira ticket key from URL: ${ticketUrl}`,
    });
  }
  return key;
}

function extractFigmaLinks(text: string): string[] {
  return [...new Set(text.match(FIGMA_RE) ?? [])];
}

interface JiraApiIssue {
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    components?: Array<{ name: string }>;
    labels?: string[];
    issuelinks?: Array<{
      outwardIssue?: { self: string };
      inwardIssue?: { self: string };
    }>;
  };
}

export class JiraService {
  private baseUrl: string;
  private token: string;

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private async request<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...this.headers(), ...init?.headers } });
    } catch (err) {
      throw new JiraError({ message: `Jira request failed: ${endpoint}`, cause: err });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new JiraError({ message: `Jira API ${res.status}: ${text}` });
    }
    return (await res.json()) as T;
  }

  async fetchIssue(ticketUrl: string): Promise<JiraIssue> {
    const key = parseTicketKey(ticketUrl);
    const data = await this.request<JiraApiIssue>(`/rest/api/2/issue/${key}`);
    const fields = data.fields;
    const description = fields.description ?? "";

    return {
      key: data.key,
      summary: fields.summary,
      description,
      components: (fields.components ?? []).map((c) => c.name),
      labels: fields.labels ?? [],
      links: (fields.issuelinks ?? []).flatMap((l) => {
        const r: string[] = [];
        if (l.outwardIssue?.self) r.push(l.outwardIssue.self);
        if (l.inwardIssue?.self) r.push(l.inwardIssue.self);
        return r;
      }),
      figmaLinks: extractFigmaLinks(description),
    };
  }

  /** Get available transitions for an issue (dynamic — no hardcoding) */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const data = await this.request<{ transitions: Array<{ id: string; name: string }> }>(
      `/rest/api/2/issue/${issueKey}/transitions`
    );
    return data.transitions.map((t) => ({ id: t.id, name: t.name }));
  }

  /** Transition issue to a new status by transition name */
  async transitionIssue(issueKey: string, transitionName: string): Promise<void> {
    const transitions = await this.getTransitions(issueKey);
    const target = transitions.find(
      (t) => t.name.toLowerCase() === transitionName.toLowerCase()
    );
    if (!target) {
      throw new JiraError({
        message: `Transition "${transitionName}" not available for ${issueKey}. Available: ${transitions.map((t) => t.name).join(", ")}`,
      });
    }
    await this.request(`/rest/api/2/issue/${issueKey}/transitions`, {
      method: "POST",
      body: JSON.stringify({ transition: { id: target.id } }),
    });
  }

  /** Add a comment to an issue */
  async addComment(issueKey: string, body: string): Promise<void> {
    await this.request(`/rest/api/2/issue/${issueKey}/comment`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
}
