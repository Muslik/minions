import type { NotifyPayload, NotifyAction } from "./notifier.js";

const TG_API = "https://api.telegram.org/bot";
const TG_MSG_LIMIT = 4096;

const STATUS_LABEL: Record<string, string> = {
  started: "🚀 Взята в работу",
  awaiting_approval: "📋 План готов",
  coding: "⚙️ Пишу код",
  waiting_for_ci: "⏳ Жду CI...",
  ci_passed: "✅ CI прошёл",
  ci_failed: "❌ CI упал",
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
      const { header, planChunks } = formatParts(payload);

      if (existing && !planChunks.length) {
        // Edit existing message in-place (short message, no plan splitting)
        await this.editMessage(existing, header, replyMarkup);
      } else if (existing && planChunks.length) {
        // Plan is split: edit existing to header, send plan chunks, last gets buttons
        await this.editMessage(existing, header);
        for (let i = 0; i < planChunks.length; i++) {
          const isLast = i === planChunks.length - 1;
          const msgId = await this.sendMsg(planChunks[i]!, isLast ? replyMarkup : undefined);
          if (isLast && msgId) {
            this.messageIds.set(payload.runId, msgId);
          }
        }
      } else {
        // New message — may need splitting
        if (planChunks.length) {
          // Send header first, then plan chunks; track last
          const headerId = await this.sendMsg(header);
          if (headerId) this.messageIds.set(payload.runId, headerId);
          for (let i = 0; i < planChunks.length; i++) {
            const isLast = i === planChunks.length - 1;
            const msgId = await this.sendMsg(planChunks[i]!, isLast ? replyMarkup : undefined);
            if (isLast && msgId) {
              this.messageIds.set(payload.runId, msgId);
            }
          }
        } else {
          const msgId = await this.sendMsg(header, replyMarkup);
          if (msgId) this.messageIds.set(payload.runId, msgId);
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

  private async sendMsg(
    text: string,
    replyMarkup?: Record<string, unknown>
  ): Promise<number | undefined> {
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
      return data.result?.message_id;
    }
    const respText = await res.text().catch(() => "");
    console.error(`[telegram] sendMessage returned ${res.status}: ${respText}`);
    return undefined;
  }

  private async editMessage(
    messageId: number,
    text: string,
    replyMarkup?: Record<string, unknown>
  ): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: this.chatId,
      message_id: messageId,
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
  }
}

interface FormattedParts {
  header: string;
  planChunks: string[];
}

function formatParts(p: NotifyPayload): FormattedParts {
  const label = STATUS_LABEL[p.status] ?? p.status;
  const ticket = p.ticketKey
    ? p.ticketUrl
      ? `<a href="${escHtml(p.ticketUrl)}">${escHtml(p.ticketKey)}</a>`
      : `<b>${escHtml(p.ticketKey)}</b>`
    : "";

  const header = ticket ? `${label} — ${ticket}` : label;

  if (p.status === "awaiting_approval") {
    const plan = p.message || "(no plan)";
    const escaped = escHtml(plan);
    // 13 = len("<pre>") + len("</pre>") + some margin
    const chunkSize = TG_MSG_LIMIT - 20;
    if (escaped.length <= chunkSize) {
      return { header: header + "\n\n" + `<pre>${escaped}</pre>`, planChunks: [] };
    }
    // Split plan into multiple <pre> messages
    const chunks: string[] = [];
    for (let i = 0; i < escaped.length; i += chunkSize) {
      chunks.push(`<pre>${escaped.slice(i, i + chunkSize)}</pre>`);
    }
    return { header, planChunks: chunks };
  }

  const parts: string[] = [header];

  if (p.status === "done" && p.data && typeof p.data === "object" && "prUrl" in p.data) {
    const prUrl = (p.data as { prUrl?: string }).prUrl;
    if (prUrl) parts.push(`<a href="${escHtml(prUrl)}">Открыть PR</a>`);
  } else if (p.message && p.status !== "started") {
    parts.push(escHtml(p.message));
  }

  return { header: parts.join("\n\n"), planChunks: [] };
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
