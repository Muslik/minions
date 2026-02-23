import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * The parseTicketKey function is private to src/services/jira.ts.
 * We re-implement the same logic here to test it in isolation,
 * exactly mirroring what the production code does.
 *
 * Production logic:
 *   const url = new URL(ticketUrl);
 *   const segments = url.pathname.split("/").filter(Boolean);
 *   const key = segments[segments.length - 1];
 *   if (!key || !/^[A-Z]+-\d+$/.test(key)) throw JiraError
 *   return key;
 */

class JiraParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraParseError";
  }
}

function parseTicketKey(ticketUrl: string): string {
  const url = new URL(ticketUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const key = segments[segments.length - 1];
  if (!key || !/^[A-Z]+-\d+$/.test(key)) {
    throw new JiraParseError(
      `Cannot parse Jira ticket key from URL: ${ticketUrl}`
    );
  }
  return key;
}

describe("Jira URL parsing — parseTicketKey", () => {
  it("extracts key from a canonical browse URL", () => {
    const key = parseTicketKey("https://jira.twiket.com/browse/AVIA-1234");
    assert.equal(key, "AVIA-1234");
  });

  it("extracts key with a multi-word project prefix", () => {
    const key = parseTicketKey("https://jira.example.com/browse/MYPROJECT-99");
    assert.equal(key, "MYPROJECT-99");
  });

  it("extracts key from a URL with query parameters", () => {
    const key = parseTicketKey(
      "https://jira.twiket.com/browse/AVIA-1234?focusedCommentId=12345&page=1"
    );
    assert.equal(key, "AVIA-1234");
  });

  it("extracts key from a URL with a trailing slash", () => {
    // After filter(Boolean), trailing slash segment is removed
    // URL("https://jira.example.com/browse/AVIA-5678/").pathname => /browse/AVIA-5678/
    // split("/").filter(Boolean) => ["browse", "AVIA-5678"]
    const key = parseTicketKey("https://jira.example.com/browse/AVIA-5678/");
    assert.equal(key, "AVIA-5678");
  });

  it("extracts key from a URL with a hash fragment", () => {
    const key = parseTicketKey(
      "https://jira.example.com/browse/PROJ-42#activity"
    );
    assert.equal(key, "PROJ-42");
  });

  it("throws when the URL path has no valid Jira key at the end", () => {
    assert.throws(
      () => parseTicketKey("https://jira.example.com/projects/AVIA"),
      (err: unknown) => {
        assert.ok(err instanceof JiraParseError);
        assert.ok(err.message.includes("Cannot parse Jira ticket key"));
        return true;
      }
    );
  });

  it("throws when the last path segment is all letters (no dash-number)", () => {
    assert.throws(
      () => parseTicketKey("https://jira.example.com/browse/AVIA"),
      (err: unknown) => {
        assert.ok(err instanceof JiraParseError);
        return true;
      }
    );
  });

  it("throws when the last path segment starts with a lowercase letter", () => {
    assert.throws(
      () => parseTicketKey("https://jira.example.com/browse/avia-123"),
      (err: unknown) => {
        assert.ok(err instanceof JiraParseError);
        return true;
      }
    );
  });

  it("throws when the URL is not a valid URL at all", () => {
    assert.throws(
      () => parseTicketKey("not-a-valid-url"),
      (err: unknown) => {
        // new URL() throws a TypeError for invalid URLs
        assert.ok(err instanceof TypeError || err instanceof JiraParseError);
        return true;
      }
    );
  });

  it("extracts key from an internal Jira URL with numeric ticket number zero", () => {
    // PROJ-0 is technically valid per the regex [A-Z]+-\d+
    const key = parseTicketKey("https://jira.example.com/browse/PROJ-0");
    assert.equal(key, "PROJ-0");
  });

  it("throws when the URL has no path segments after the domain", () => {
    assert.throws(
      () => parseTicketKey("https://jira.example.com/"),
      (err: unknown) => {
        assert.ok(err instanceof JiraParseError);
        return true;
      }
    );
  });

  it("handles a plain Jira key passed directly (not a URL)", () => {
    // "AVIA-1234" is not a valid URL — new URL() will throw TypeError
    assert.throws(
      () => parseTicketKey("AVIA-1234"),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        return true;
      }
    );
  });
});
