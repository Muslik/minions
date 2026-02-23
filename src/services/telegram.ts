import type { NotifyPayload, NotifyAction } from "./notifier.js";

const TG_API = "https://api.telegram.org/bot";
const TG_MSG_LIMIT = 4096;

const STATUS_LABEL: Record<string, string> = {
  started: "🚀 Взята в работу",
  awaiting_approval: "📋 План готов",
  coding: "⚙️ Пишу код",
  done: "✅ Готово",
  escalated: "⚠️ Эскалация",
  failed: "❌ Ошибка",
};

export class TelegramChannel {
  private baseUrl: string;
  private chatId: string;
  /** runId → TG message_id for edit-in-place */
  private messageIds = new Map<string, number>();

  constructor(botToken: string, chatId: string) {
    this.baseUrl = `${TG_API}${botToken}`;
    this.chatId = chatId;
  }

  async send(payload: NotifyPayload): Promise<void> {
    const text = formatMessage(payload);

    const replyMarkup = payload.actions?.length
      ? {
          inline_keyboard: [
            payload.actions.map((a) => ({
              text: a.label,
              callback_data: buildCallbackData(a, payload.runId),
            })),
          ],
        }
      : undefined;

    const existing = this.messageIds.get(payload.runId);

    try {
      if (existing) {
        // Edit existing message in-place
        const body: Record<string, unknown> = {
          chat_id: this.chatId,
          message_id: existing,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        };
        if (replyMarkup) {
          body["reply_markup"] = replyMarkup;
        } else {
          body["reply_markup"] = { inline_keyboard: [] };
        }

        const res = await fetch(`${this.baseUrl}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const respText = await res.text().catch(() => "");
          console.error(`[telegram] editMessageText returned ${res.status}: ${respText}`);
        }
      } else {
        // Send new message, remember message_id
        const body: Record<string, unknown> = {
          chat_id: this.chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        };
        if (replyMarkup) body["reply_markup"] = replyMarkup;

        const res = await fetch(`${this.baseUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = (await res.json()) as { result?: { message_id?: number } };
          if (data.result?.message_id) {
            this.messageIds.set(payload.runId, data.result.message_id);
          }
        } else {
          const respText = await res.text().catch(() => "");
          console.error(`[telegram] sendMessage returned ${res.status}: ${respText}`);
        }
      }
    } catch (err) {
      console.error("[telegram] Failed to send:", err);
    }

    // Cleanup finished runs from map
    if (payload.status === "done" || payload.status === "failed" || payload.status === "escalated") {
      this.messageIds.delete(payload.runId);
    }
  }
}

function formatMessage(p: NotifyPayload): string {
  const label = STATUS_LABEL[p.status] ?? p.status;
  const ticket = p.ticketKey
    ? p.ticketUrl
      ? `<a href="${escHtml(p.ticketUrl)}">${escHtml(p.ticketKey)}</a>`
      : `<b>${escHtml(p.ticketKey)}</b>`
    : "";

  const header = ticket ? `${label} — ${ticket}` : label;

  const parts: string[] = [header];

  if (p.status === "awaiting_approval") {
    const plan = p.message || "(no plan)";
    const maxPlan = TG_MSG_LIMIT - header.length - 60;
    const truncated =
      plan.length > maxPlan ? plan.slice(0, maxPlan) + "\n…(truncated)" : plan;
    parts.push(`<pre>${escHtml(truncated)}</pre>`);
  } else if (p.status === "done" && p.data && typeof p.data === "object" && "prUrl" in p.data) {
    const prUrl = (p.data as { prUrl?: string }).prUrl;
    if (prUrl) parts.push(`<a href="${escHtml(prUrl)}">Открыть PR</a>`);
  } else if (p.message && p.status !== "started") {
    parts.push(escHtml(p.message));
  }

  return parts.join("\n\n");
}

function buildCallbackData(action: NotifyAction, runId: string): string {
  const act = action.body["action"];
  if (act) return `mn:${act}:${runId}`;
  if (action.endpoint.endsWith("/cancel")) return `mn:cancel:${runId}`;
  return `mn:action:${runId}`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
