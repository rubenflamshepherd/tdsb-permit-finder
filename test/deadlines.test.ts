import { describe, expect, it } from "vitest";
import { nextDeadline } from "../lib/deadlines";

const at = (iso: string) => new Date(iso + "T12:00:00");

describe("nextDeadline", () => {
  it("picks Jan 31 (outdoor) when called in mid-January", () => {
    const d = nextDeadline(at("2026-01-15"));
    expect(d.kind).toBe("outdoor-field");
    expect(d.label).toBe("January 31");
    expect(d.occursAt.getFullYear()).toBe(2026);
  });

  it("still picks Jan 31 on Jan 31 itself (day-of counts as upcoming)", () => {
    const d = nextDeadline(at("2026-01-31"));
    expect(d.kind).toBe("outdoor-field");
  });

  it("rolls to March 1 (summer indoor) the day after Jan 31", () => {
    const d = nextDeadline(at("2026-02-01"));
    expect(d.kind).toBe("summer-indoor");
    expect(d.label).toBe("March 1");
  });

  it("picks March 1 on March 1 itself", () => {
    const d = nextDeadline(at("2026-03-01"));
    expect(d.kind).toBe("summer-indoor");
  });

  it("rolls to June 1 (school year indoor) after March 1", () => {
    const d = nextDeadline(at("2026-03-02"));
    expect(d.kind).toBe("school-year-indoor");
    expect(d.label).toBe("June 1");
  });

  it("picks June 1 on June 1 itself", () => {
    const d = nextDeadline(at("2026-06-01"));
    expect(d.kind).toBe("school-year-indoor");
    expect(d.occursAt.getFullYear()).toBe(2026);
  });

  it("rolls to next year's Jan 31 the day after June 1", () => {
    const d = nextDeadline(at("2026-06-02"));
    expect(d.kind).toBe("outdoor-field");
    expect(d.occursAt.getFullYear()).toBe(2027);
  });

  it("rolls to next year's Jan 31 at year-end", () => {
    const d = nextDeadline(at("2026-12-31"));
    expect(d.kind).toBe("outdoor-field");
    expect(d.occursAt.getFullYear()).toBe(2027);
  });

  it("ignores time-of-day on the deadline date itself", () => {
    // Late-evening on March 1 still counts as upcoming, not past
    const d = nextDeadline(new Date("2026-03-01T23:59:00"));
    expect(d.kind).toBe("summer-indoor");
  });

  it("returns the description string matching TDSB language", () => {
    expect(nextDeadline(at("2026-05-24")).description).toBe("school year indoor permits");
    expect(nextDeadline(at("2026-02-15")).description).toBe("summer indoor permits");
    expect(nextDeadline(at("2026-01-15")).description).toBe("outdoor field permits");
  });
});
