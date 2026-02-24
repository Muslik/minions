import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveTelegramConfig } from "../src/services/telegram-config.ts";

describe("resolveTelegramConfig", () => {
  it("disables telegram when bot token or chatId is empty", () => {
    const cfg = resolveTelegramConfig("", "");
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.reason, "notifier.telegram.botToken/chatId are empty");
  });

  it("disables telegram when bot token format is invalid", () => {
    const cfg = resolveTelegramConfig("invalid-token", "123");
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.reason, "notifier.telegram.botToken has invalid format");
  });

  it("disables telegram when chatId is not numeric", () => {
    const cfg = resolveTelegramConfig(
      "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabc",
      "chat-1"
    );
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.reason, "notifier.telegram.chatId must be numeric");
  });

  it("enables telegram for valid token/chatId and trims spaces", () => {
    const cfg = resolveTelegramConfig(
      " 123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabc ",
      " -1001122334455 "
    );
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.botToken, "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabc");
    assert.equal(cfg.chatId, "-1001122334455");
  });
});
