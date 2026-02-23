import { Command } from "@langchain/langgraph";
import type { TgCallbackQuery } from "./types.js";
import type { CompiledGraph } from "../api/server.js";
import type { ResumeAction } from "../domain/types.js";

const CB_RE = /^mn:(approve|revise|cancel):(.+)$/;

export interface PendingRevise {
  runId: string;
}

export interface CallbackDeps {
  graph: CompiledGraph;
  baseUrl: string;
  pendingRevise: Map<number, PendingRevise>;
}

export async function handleCallback(
  cb: TgCallbackQuery,
  deps: CallbackDeps
): Promise<void> {
  const { graph, baseUrl, pendingRevise } = deps;
  const chatId = cb.message?.chat.id;
  if (!cb.data || !chatId) return;

  const match = CB_RE.exec(cb.data);
  if (!match) return;

  const action = match[1] as ResumeAction;
  const runId = match[2]!;

  if (action === "revise") {
    pendingRevise.set(chatId, { runId });
    await answerCallbackQuery(baseUrl, cb.id, "Напишите комментарий к ревизии");
    await sendMessage(baseUrl, chatId, "Напишите комментарий для ревизии:", {
      force_reply: true,
      selective: true,
    });
    return;
  }

  // approve or cancel
  try {
    await graph.invoke(new Command({ resume: { action } }), {
      configurable: { thread_id: runId },
    });
    await answerCallbackQuery(
      baseUrl,
      cb.id,
      action === "approve" ? "Принято ✅" : "Отменено ❌"
    );
  } catch (err) {
    console.error(`[bot/callbacks] resume ${action} ${runId} failed:`, err);
    await answerCallbackQuery(baseUrl, cb.id, "Ошибка обработки");
  }
}

async function answerCallbackQuery(
  baseUrl: string,
  callbackQueryId: string,
  text: string
): Promise<void> {
  await fetch(`${baseUrl}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch((err) => console.error("[bot/callbacks] answerCallbackQuery:", err));
}

async function sendMessage(
  baseUrl: string,
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  await fetch(`${baseUrl}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  }).catch((err) => console.error("[bot/callbacks] sendMessage:", err));
}
