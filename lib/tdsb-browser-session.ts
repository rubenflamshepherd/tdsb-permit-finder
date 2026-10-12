import { BASE_URL, isTdsbBotChallenge, TdsbFetch } from "./tdsb-client";

type SessionHeaders = { cookie: string; "user-agent": string };

const CHALLENGE_TIMEOUT_MS = 30000;

// Wraps fetch so every request carries the cookies and user agent of a
// browser session that has passed TDSB's bot challenge. If the session
// expires mid-run, it is re-solved once and the request retried.
export function createTdsbSessionFetch(solve: () => Promise<SessionHeaders>, baseFetch: TdsbFetch = globalThis.fetch): TdsbFetch {
  let session: Promise<SessionHeaders> | undefined;

  const attempt = async (url: URL, init: RequestInit | undefined, headers: SessionHeaders) => {
    const merged = new Headers(init?.headers);
    merged.set("cookie", headers.cookie);
    merged.set("user-agent", headers["user-agent"]);
    const response = await baseFetch(url, { ...init, headers: merged });
    const body = await response.text();
    const result = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    Object.defineProperty(result, "url", { value: response.url || url.toString() });
    return { result, challenged: isTdsbBotChallenge(body) };
  };

  return async (url, init) => {
    const current = (session ??= solve());
    const first = await attempt(url, init, await current);
    if (!first.challenged) return first.result;
    if (session === current) session = solve();
    return (await attempt(url, init, await session)).result;
  };
}

export async function openTdsbBrowserSession(baseUrl = BASE_URL): Promise<{ fetch: TdsbFetch; close: () => Promise<void> }> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const solve = async (): Promise<SessionHeaders> => {
    await page.goto(new URL("/cu/api/space_types/fetch_available?permit_type_id=3", baseUrl).toString());
    await page.waitForFunction(() => !document.documentElement.outerHTML.includes("_Incapsula_Resource"), undefined, { timeout: CHALLENGE_TIMEOUT_MS });
    const cookies = await context.cookies(baseUrl);
    return {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "user-agent": await page.evaluate(() => navigator.userAgent),
    };
  };

  return { fetch: createTdsbSessionFetch(solve), close: () => browser.close() };
}
