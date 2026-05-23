import { describe, expect, it } from "vitest";
import { computeAvailability } from "../lib/availability";

describe("computeAvailability", () => {
  const facility = { id: 1, name: "Test School", hoursJson: null };
  const space = { id: 10, facilityId: 1, spaceTypeId: 18, name: "Gym", isAvailable: true, hideFromPublic: false, hoursJson: null, facility };
  const search = { startDate: "2026-06-01", endDate: "2026-06-03", weekdays: [1, 3], startTime: "18:00", endTime: "20:00", spaceTypeIds: [18], matchMode: "all" as const };

  it("returns a full match when there are no conflicts", () => {
    const results = computeAvailability({ search, spaces: [space], bookings: [], specialDates: [] });
    expect(results).toHaveLength(1);
    expect(results[0].availableOccurrences).toBe(2);
  });

  it("removes a result in all mode when a booking overlaps", () => {
    const results = computeAvailability({
      search,
      spaces: [space],
      bookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-01T19:00:00"), endsAt: new Date("2026-06-01T21:00:00") }],
      specialDates: [],
    });
    expect(results).toHaveLength(0);
  });

  it("keeps partial matches", () => {
    const results = computeAvailability({
      search: { ...search, matchMode: "partial" },
      spaces: [space],
      bookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-01T19:00:00"), endsAt: new Date("2026-06-01T21:00:00") }],
      specialDates: [],
    });
    expect(results).toHaveLength(1);
    expect(results[0].availableOccurrences).toBe(1);
  });
});
