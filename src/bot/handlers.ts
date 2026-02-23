import type { TgUpdate } from "./types.js";
import type { CallbackDeps } from "./callbacks.js";
import type { CommandDeps } from "./commands.js";
import { handleCallback } from "./callbacks.js";
import { handleMessage } from "./commands.js";

export interface HandlerDeps {
  allowedChatId: number;
  callbackDeps: CallbackDeps;
  commandDeps: CommandDeps;
}

export async function dispatch(
  update: TgUpdate,
  deps: HandlerDeps
): Promise<void> {
  const { allowedChatId, callbackDeps, commandDeps } = deps;

  if (update.callback_query) {
    const cbChatId = update.callback_query.message?.chat.id;
    if (cbChatId !== allowedChatId) return;
    await handleCallback(update.callback_query, callbackDeps);
    return;
  }

  if (update.message) {
    if (update.message.chat.id !== allowedChatId) return;
    await handleMessage(update.message, commandDeps);
  }
}
