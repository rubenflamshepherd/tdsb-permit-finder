import { describe, expect, it } from "vitest";
import { getFee, CATEGORY_LABELS, pickTimeOfUse } from "../lib/fees";

describe("getFee", () => {
  it("returns indoor School Day rate for Single Gym", () => {
    expect(getFee(18, "B", "school-day")).toBe(31.08);
    expect(getFee(18, "A1", "school-day")).toBe(12.43);
    expect(getFee(18, "C", "school-day")).toBe(53.11);
  });

  it("returns higher Saturday rate than weekday for the same space", () => {
    expect(getFee(18, "B", "saturday")).toBe(46.62);
    expect(getFee(18, "B", "saturday")! > getFee(18, "B", "school-day")!).toBe(true);
  });

  it("returns Sunday & Holiday rate", () => {
    expect(getFee(17, "B", "sunday-holiday")).toBe(152.26);
  });

  it("returns outdoor rate regardless of timeOfUse bucket", () => {
    expect(getFee(13, "B", "outdoor")).toBe(26.41);
    expect(getFee(44, "C", "outdoor")).toBe(268.52);
  });

  it("maps Playground/Ball-courts (47) to the same rate as Diamond (12)", () => {
    expect(getFee(47, "B", "outdoor")).toBe(getFee(12, "B", "outdoor"));
  });

  it("returns null for space types not in the published schedule", () => {
    expect(getFee(21, "B", "school-day")).toBe(null); // Lunch Room
  });

  it("returns null for unknown space type ids", () => {
    expect(getFee(99999, "B", "school-day")).toBe(null);
  });

  it("pickTimeOfUse: empty selection defaults to school-day", () => {
    expect(pickTimeOfUse([])).toBe("school-day");
  });

  it("pickTimeOfUse: any weekday in selection means school-day", () => {
    expect(pickTimeOfUse([1, 6, 7])).toBe("school-day");
    expect(pickTimeOfUse([3])).toBe("school-day");
    expect(pickTimeOfUse([1, 2, 3, 4, 5])).toBe("school-day");
  });

  it("pickTimeOfUse: Saturday-only returns saturday", () => {
    expect(pickTimeOfUse([6])).toBe("saturday");
  });

  it("pickTimeOfUse: Sunday-only returns sunday-holiday", () => {
    expect(pickTimeOfUse([7])).toBe("sunday-holiday");
  });

  it("pickTimeOfUse: Sat+Sun together returns sunday-holiday (the higher rate)", () => {
    expect(pickTimeOfUse([6, 7])).toBe("sunday-holiday");
  });

  it("exposes human-readable category labels", () => {
    expect(CATEGORY_LABELS.A1).toMatch(/youth|senior|subsid/i);
    expect(CATEGORY_LABELS.B).toMatch(/cost recovery/i);
    expect(CATEGORY_LABELS.C).toMatch(/commercial/i);
  });
});
