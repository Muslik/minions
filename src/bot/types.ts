export interface TgUser {
  id: number;
  first_name: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  reply_to_message?: TgMessage;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface TgGetUpdatesResult {
  ok: boolean;
  result: TgUpdate[];
  error_code?: number;
  description?: string;
}

export interface TgSendMessageResult {
  ok: boolean;
  result?: { message_id: number };
}
