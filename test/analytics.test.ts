import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendGAEvent = vi.fn();

vi.mock("@next/third-parties/google", () => ({
  sendGAEvent: (...args: unknown[]) => sendGAEvent(...args),
}));

describe("trackEvent", () => {
  beforeEach(() => {
    sendGAEvent.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a no-op when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
    const { trackEvent } = await import("../lib/analytics");
    trackEvent("search_initiated", { space_type_id: 1 });
    expect(sendGAEvent).not.toHaveBeenCalled();
  });

  it("forwards event name and params to sendGAEvent when the ID is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    const { trackEvent } = await import("../lib/analytics");
    trackEvent("space_type_selected", { space_type_id: 42 });
    expect(sendGAEvent).toHaveBeenCalledTimes(1);
    expect(sendGAEvent).toHaveBeenCalledWith("event", "space_type_selected", { space_type_id: 42 });
  });

  it("passes an empty params object when no params are provided", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    const { trackEvent } = await import("../lib/analytics");
    trackEvent("permit_window_opened");
    expect(sendGAEvent).toHaveBeenCalledWith("event", "permit_window_opened", {});
  });
});
