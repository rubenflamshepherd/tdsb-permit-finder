import { describe, expect, it } from "vitest";
import { parseDateWithTime, parseLocalDateTime } from "../lib/time";

describe("parseDateWithTime — pinned to America/Toronto", () => {
  it("treats 2026-09-15 18:00 as 18:00 EDT (= 22:00Z)", () => {
    expect(parseDateWithTime("2026-09-15", "18:00").toISOString()).toBe("2026-09-15T22:00:00.000Z");
  });

  it("treats 2026-01-15 18:00 as 18:00 EST (= 23:00Z)", () => {
    expect(parseDateWithTime("2026-01-15", "18:00").toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("handles the spring DST transition (Mar 8 2026)", () => {
    // 01:00 EST exists; 02:00 doesn't (jumps to 03:00 EDT).
    expect(parseDateWithTime("2026-03-08", "01:00").toISOString()).toBe("2026-03-08T06:00:00.000Z");
    expect(parseDateWithTime("2026-03-08", "03:00").toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });

  it("handles the fall DST transition (Nov 1 2026)", () => {
    // 00:00 EDT.
    expect(parseDateWithTime("2026-11-01", "00:00").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    // 03:00 EST (after the fall-back).
    expect(parseDateWithTime("2026-11-01", "03:00").toISOString()).toBe("2026-11-01T08:00:00.000Z");
  });
});

describe("parseLocalDateTime — pinned to America/Toronto", () => {
  it("treats 2026-09-15 18:00:00 as 18:00 EDT (= 22:00Z)", () => {
    expect(parseLocalDateTime("2026-09-15 18:00:00").toISOString()).toBe("2026-09-15T22:00:00.000Z");
  });

  it("treats 2026-01-15 23:59:59 as EST (= 04:59:59Z next day)", () => {
    expect(parseLocalDateTime("2026-01-15 23:59:59").toISOString()).toBe("2026-01-16T04:59:59.000Z");
  });
});
