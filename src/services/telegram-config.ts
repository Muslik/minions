export interface TelegramConfigResolution {
  enabled: boolean;
  botToken: string;
  chatId: string;
  reason?: string;
}

const BOT_TOKEN_RE = /^\d+:[A-Za-z0-9_-]{20,}$/;
const CHAT_ID_RE = /^-?\d+$/;

export function resolveTelegramConfig(
  rawBotToken: string,
  rawChatId: string
): TelegramConfigResolution {
  const botToken = rawBotToken.trim();
  const chatId = rawChatId.trim();

  if (!botToken || !chatId) {
    return {
      enabled: false,
      botToken,
      chatId,
      reason: "notifier.telegram.botToken/chatId are empty",
    };
  }

  if (!BOT_TOKEN_RE.test(botToken)) {
    return {
      enabled: false,
      botToken,
      chatId,
      reason: "notifier.telegram.botToken has invalid format",
    };
  }

  if (!CHAT_ID_RE.test(chatId)) {
    return {
      enabled: false,
      botToken,
      chatId,
      reason: "notifier.telegram.chatId must be numeric",
    };
  }

  return { enabled: true, botToken, chatId };
}
