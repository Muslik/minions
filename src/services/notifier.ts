import { createHmac } from "crypto";
import type { NotifierConfig } from "../config/schema.js";

interface NotifyPayload {
  runId: string;
  status: string;
  message: string;
  data?: unknown;
}

export class NotifierService {
  private webhookUrl: string;
  private hmacSecret: string;

  constructor(config: NotifierConfig) {
    this.webhookUrl = config.webhookUrl;
    this.hmacSecret = config.hmacSecret;
  }

  async notify(payload: NotifyPayload): Promise<void> {
    try {
      const body = JSON.stringify(payload);
      const signature = createHmac("sha256", this.hmacSecret)
        .update(body)
        .digest("hex");

      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": `sha256=${signature}`,
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(
          `[notifier] Webhook returned ${res.status}: ${text}`
        );
      }
    } catch (err) {
      console.error("[notifier] Failed to send notification:", err);
    }
  }
}
