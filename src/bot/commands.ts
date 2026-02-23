import { Command } from "@langchain/langgraph";
import type { TgMessage } from "./types.js";
import type { PendingRevise } from "./callbacks.js";
import type { RunStore } from "../store/runs.js";
import type { CompiledGraph } from "../api/server.js";
import type { NodeDeps } from "../graph/nodes/deps.js";
import { launchRun } from "../services/run-launcher.js";

const JIRA_URL_RE = /https?:\/\/[^\s]+\/browse\/[A-Z][\w]+-\d+/;

export interface CommandDeps {
  runStore: RunStore;
  graph: CompiledGraph;
  nodeDeps: NodeDeps;
  baseUrl: string;
  pendingRevise: Map<number, PendingRevise>;
}

export async function handleMessage(
  msg: TgMessage,
  deps: CommandDeps
): Promise<void> {
  const { runStore, graph, nodeDeps, baseUrl, pendingRevise } = deps;
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text) return;

  // Check for pending revise first
  const pending = pendingRevise.get(chatId);
  if (pending) {
    pendingRevise.delete(chatId);
    try {
      graph
        .invoke(new Command({ resume: { action: "revise", comment: text } }), {
          configurable: { thread_id: pending.runId },
        })
        .catch((err: unknown) =>
          console.error(`[bot/commands] revise resume failed:`, err)
        );
      await reply(baseUrl, chatId, `Комментарий отправлен для рана ${pending.runId}`);
    } catch (err) {
      console.error("[bot/commands] revise failed:", err);
      await reply(baseUrl, chatId, "Ошибка при отправке комментария");
    }
    return;
  }

  // /start
  if (text === "/start") {
    await reply(
      baseUrl,
      chatId,
      "Minions Bot 🤖\n\nОтправьте Jira URL для создания рана.\n\nКоманды:\n/status — активные раны\n/cancel <runId> — отменить ран"
    );
    return;
  }

  // /status
  if (text === "/status") {
    const active = runStore
      .list()
      .filter(
        (r) =>
          r.status !== "DONE" && r.status !== "FAILED" && r.status !== "ESCALATED"
      );
    if (!active.length) {
      await reply(baseUrl, chatId, "Нет активных ранов.");
      return;
    }
    const lines = active.map(
      (r) => `• <code>${r.id.slice(0, 8)}</code> ${r.status} — ${r.payload.ticketUrl}`
    );
    await reply(baseUrl, chatId, lines.join("\n"), "HTML");
    return;
  }

  // /cancel <runId>
  if (text.startsWith("/cancel ")) {
    const runId = text.slice(8).trim();
    const run = runStore.get(runId);
    if (!run) {
      await reply(baseUrl, chatId, `Ран ${runId} не найден.`);
      return;
    }
    graph
      .invoke(
        new Command({ resume: { action: "cancel", comment: "Cancelled via TG bot" } }),
        { configurable: { thread_id: runId } }
      )
      .catch((err: unknown) =>
        console.error(`[bot/commands] cancel ${runId} failed:`, err)
      );
    await reply(baseUrl, chatId, `Отмена рана ${runId}...`);
    return;
  }

  // Jira URL
  const jiraMatch = JIRA_URL_RE.exec(text);
  if (jiraMatch) {
    const ticketUrl = jiraMatch[0];
    const requesterId = String(msg.from?.id ?? chatId);
    const runId = launchRun(
      { ticketUrl, chatId: String(chatId), requesterId },
      runStore,
      graph,
      nodeDeps
    );
    await reply(
      baseUrl,
      chatId,
      `Задача взята в работу 🚀\nРан: <code>${runId}</code>`,
      "HTML"
    );
    return;
  }
}

async function reply(
  baseUrl: string,
  chatId: number,
  text: string,
  parseMode?: string
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body["parse_mode"] = parseMode;

  const res = await fetch(`${baseUrl}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error("[bot/commands] sendMessage:", err);
    return undefined;
  });

  if (res && !res.ok) {
    const t = await res.text().catch(() => "");
    console.error(`[bot/commands] sendMessage ${res.status}: ${t}`);
  }
}
