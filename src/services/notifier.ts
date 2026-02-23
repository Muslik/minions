export interface NotifyAction {
  label: string;
  endpoint: string;
  body: Record<string, string>;
}

export interface NotifyPayload {
  runId: string;
  status: string;
  message: string;
  chatId: string;
  requesterId: string;
  ticketKey?: string;
  ticketUrl?: string;
  data?: unknown;
  actions?: NotifyAction[];
}

export interface NotifyChannel {
  send(payload: NotifyPayload): Promise<void>;
}

export class NotifierService {
  private channels: NotifyChannel[];

  constructor(channels: NotifyChannel[]) {
    this.channels = channels;
  }

  async notify(payload: NotifyPayload): Promise<void> {
    await Promise.allSettled(
      this.channels.map((ch) => ch.send(payload))
    );
  }
}
