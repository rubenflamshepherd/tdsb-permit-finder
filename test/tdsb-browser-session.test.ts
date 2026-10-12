import { describe, expect, it, vi } from "vitest";
import { createTdsbSessionFetch } from "../lib/tdsb-browser-session";
import { TdsbClient, TdsbFetch } from "../lib/tdsb-client";

const CHALLENGE = `<html style="height:100%"><head><script type="text/javascript" src="/_Incapsula_Resource?SWJIYLWA=abc"></script></head><body>Request unsuccessful. Incapsula incident ID: 1</body></html>`;

describe("createTdsbSessionFetch", () => {
  it("sends the solved session's cookie and user agent", async () => {
    const baseFetch = vi.fn<TdsbFetch>(async () => new Response("[]"));
    const sessionFetch = createTdsbSessionFetch(async () => ({ cookie: "incap=1", "user-agent": "Chrome" }), baseFetch);

    await sessionFetch(new URL("https://tdsb.example/a"));

    const headers = new Headers(baseFetch.mock.calls[0][1]?.headers);
    expect(headers.get("cookie")).toBe("incap=1");
    expect(headers.get("user-agent")).toBe("Chrome");
  });

  it("solves the challenge once up front for concurrent requests", async () => {
    const solve = vi.fn(async () => ({ cookie: "incap=1", "user-agent": "Chrome" }));
    const sessionFetch = createTdsbSessionFetch(solve, async () => new Response("[]"));

    await Promise.all([sessionFetch(new URL("https://tdsb.example/a")), sessionFetch(new URL("https://tdsb.example/b"))]);

    expect(solve).toHaveBeenCalledTimes(1);
  });

  it("re-solves and retries once when the session gets challenged", async () => {
    let session = 0;
    const solve = vi.fn(async () => ({ cookie: `incap=${++session}`, "user-agent": "Chrome" }));
    const baseFetch = vi.fn(async (_url: URL, init?: RequestInit) =>
      new Response(new Headers(init?.headers).get("cookie") === "incap=1" ? CHALLENGE : "[1]"));
    const sessionFetch = createTdsbSessionFetch(solve, baseFetch);

    const response = await sessionFetch(new URL("https://tdsb.example/a"));

    expect(await response.json()).toEqual([1]);
    expect(solve).toHaveBeenCalledTimes(2);
  });
});

describe("TdsbClient", () => {
  it("reports a bot challenge instead of a JSON parse error", async () => {
    const client = new TdsbClient("https://tdsb.example", async () => new Response(CHALLENGE));

    await expect(client.spaceTypes()).rejects.toThrow(/blocked by bot protection/);
  });
});
