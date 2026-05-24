import { describe, expect, it } from "vitest";
import { computeNearbySchedule, enumerateSlots, hasHistoricalAvailableSpace, hasLastYearHistoricalAvailableSpace, historicalHatchLevelForSlot, type SpaceLike } from "../lib/nearby-slots";

const facility = { id: 1, name: "Test School", hoursJson: null };
const baseSpace: SpaceLike = {
  id: 10, facilityId: 1, spaceTypeId: 18, name: "Gym",
  isAvailable: true, hideFromPublic: false, hoursJson: null, facility,
};

const baseInput = {
  startDate: "2026-06-01",
  startTime: "18:00",
  endTime: "20:00",
  weeks: 4,
  spaces: [baseSpace],
  facilityHours: null,
  bookings: [],
  specialDates: [],
};

const historicalInput = {
  ...baseInput,
  startDate: "2026-05-25",
  endTime: "18:30",
  weeks: 1,
};

function mondaySlot(input: Parameters<typeof computeNearbySchedule>[0], start = "18:00") {
  return computeNearbySchedule(input).find((d) => d.day === 1)!.slots.find((s) => s.start === start)!;
}

function firstWeekSpaces(input: Parameters<typeof computeNearbySchedule>[0], start = "18:00") {
  return mondaySlot(input, start).weeks[0].spaces;
}

describe("enumerateSlots", () => {
  it("splits a window into 30-min slots", () => {
    expect(enumerateSlots("18:00", "20:00")).toEqual([
      { start: "18:00", end: "18:30" },
      { start: "18:30", end: "19:00" },
      { start: "19:00", end: "19:30" },
      { start: "19:30", end: "20:00" },
    ]);
  });

  it("trims the final slot if the window does not divide evenly", () => {
    expect(enumerateSlots("18:00", "19:15")).toEqual([
      { start: "18:00", end: "18:30" },
      { start: "18:30", end: "19:00" },
      { start: "19:00", end: "19:15" },
    ]);
  });

  it("returns an empty array when endTime <= startTime", () => {
    expect(enumerateSlots("20:00", "18:00")).toEqual([]);
    expect(enumerateSlots("18:00", "18:00")).toEqual([]);
  });
});

describe("computeNearbySchedule", () => {
  it("marks every slot 'available' when there are no conflicts", () => {
    const schedule = computeNearbySchedule(baseInput);
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots).toHaveLength(4);
    expect(monday.slots.every((s) => s.status === "available")).toBe(true);
    expect(monday.slots.every((s) => s.availableWeeks === 4 && s.totalWeeks === 4)).toBe(true);
  });

  it("marks a slot 'mostly' when 60-80% of weeks are available", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      bookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-08T19:00:00"), endsAt: new Date("2026-06-08T19:30:00") }],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("mostly");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(3);
    expect(monday.slots.find((s) => s.start === "18:00")!.status).toBe("available");
  });

  it("marks a slot 'limited' when 40-59% of weeks are available", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      bookings: [
        { facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-08T19:00:00"), endsAt: new Date("2026-06-08T19:30:00") },
        { facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-15T19:00:00"), endsAt: new Date("2026-06-15T19:30:00") },
      ],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("limited");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(2);
  });

  it("marks a slot 'unavailable' when less than 40% of weeks are available", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      bookings: [1, 8, 15, 22].map((d) => ({
        facilityId: 1, spaceIds: [10],
        startsAt: new Date(`2026-06-${String(d).padStart(2, "0")}T19:00:00`),
        endsAt: new Date(`2026-06-${String(d).padStart(2, "0")}T19:30:00`),
      })),
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("unavailable");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(0);
  });

  it("marks a slot 'available' when more than 80% of weeks are available", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      weeks: 6,
      bookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-08T19:00:00"), endsAt: new Date("2026-06-08T19:30:00") }],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("available");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(5);
  });

  it("records per-week availability for each slot", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      bookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-15T19:00:00"), endsAt: new Date("2026-06-15T19:30:00") }],
    });
    const slot = schedule.find((d) => d.day === 1)!.slots.find((s) => s.start === "19:00")!;
    expect(slot.weeks).toEqual([
      { date: "2026-06-01", available: true, spaces: [{ spaceId: 10, available: true, historicallyBookedYears: [] }] },
      { date: "2026-06-08", available: true, spaces: [{ spaceId: 10, available: true, historicallyBookedYears: [] }] },
      { date: "2026-06-15", available: false, spaces: [{ spaceId: 10, available: false, historicallyBookedYears: [] }] },
      { date: "2026-06-22", available: true, spaces: [{ spaceId: 10, available: true, historicallyBookedYears: [] }] },
    ]);
  });

  it("blocks only the spaces listed in a multi-space booking, leaving sibling spaces free", () => {
    const otherSpace: SpaceLike = { ...baseSpace, id: 11, name: "Pool" };
    const thirdSpace: SpaceLike = { ...baseSpace, id: 12, name: "Auditorium" };
    // Booking covers spaces 10 and 11. Space 12 (Auditorium) is a sibling at the same facility
    // that should remain available — pre-fix this was treated as facility-wide and blocked too.
    const schedule = computeNearbySchedule({
      ...baseInput,
      spaces: [baseSpace, otherSpace, thirdSpace],
      bookings: [{ facilityId: 1, spaceIds: [10, 11], startsAt: new Date("2026-06-01T19:00:00"), endsAt: new Date("2026-06-01T19:30:00") }],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("available");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(4);
  });

  it("blocks every space in the multi-space booking when no sibling exists", () => {
    const otherSpace: SpaceLike = { ...baseSpace, id: 11, name: "Pool" };
    const schedule = computeNearbySchedule({
      ...baseInput,
      spaces: [baseSpace, otherSpace],
      bookings: [{ facilityId: 1, spaceIds: [10, 11], startsAt: new Date("2026-06-01T19:00:00"), endsAt: new Date("2026-06-01T19:30:00") }],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("mostly");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(3);
  });

  it("falls back to facility-wide blocking when spaceIds is empty", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      bookings: [{ facilityId: 1, spaceIds: [], startsAt: new Date("2026-06-01T19:00:00"), endsAt: new Date("2026-06-01T19:30:00") }],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("mostly");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(3);
  });

  it("treats a facility special date as a blocker for every slot that day", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      weeks: 2,
      specialDates: [{ facilityId: 1, startsOn: new Date("2026-06-01T00:00:00"), endsOn: new Date("2026-06-01T00:00:00") }],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.every((s) => s.availableWeeks === 1)).toBe(true);
    expect(monday.slots.every((s) => s.status === "limited")).toBe(true);
  });

  it("records no historical years when there are no historical bookings", () => {
    expect(firstWeekSpaces(historicalInput)).toEqual([
      { spaceId: 10, available: true, historicallyBookedYears: [] },
    ]);
  });

  it("records a booking exactly 52 weeks before as booked 1 year ago", () => {
    expect(firstWeekSpaces({
      ...historicalInput,
      historicalBookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2025-05-26T18:00:00"), endsAt: new Date("2025-05-26T18:30:00") }],
    })[0].historicallyBookedYears).toEqual([1]);
  });

  it("records bookings 52 and 104 weeks before as booked in both prior years", () => {
    expect(firstWeekSpaces({
      ...historicalInput,
      historicalBookings: [
        { facilityId: 1, spaceIds: [10], startsAt: new Date("2025-05-26T18:00:00"), endsAt: new Date("2025-05-26T18:30:00") },
        { facilityId: 1, spaceIds: [10], startsAt: new Date("2024-05-27T18:00:00"), endsAt: new Date("2024-05-27T18:30:00") },
      ],
    })[0].historicallyBookedYears).toEqual([1, 2]);
  });

  it("does not match the calendar-anniversary date when the weekday differs", () => {
    expect(firstWeekSpaces({
      ...historicalInput,
      historicalBookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2025-05-25T18:00:00"), endsAt: new Date("2025-05-25T18:30:00") }],
    })[0].historicallyBookedYears).toEqual([]);
  });

  it("does not record history from a sibling space", () => {
    expect(firstWeekSpaces({
      ...historicalInput,
      historicalBookings: [{ facilityId: 1, spaceIds: [11], startsAt: new Date("2025-05-26T18:00:00"), endsAt: new Date("2025-05-26T18:30:00") }],
    })[0].historicallyBookedYears).toEqual([]);
  });

  it("falls back to facility-level historical matching when spaceIds is empty", () => {
    expect(firstWeekSpaces({
      ...historicalInput,
      historicalBookings: [{ facilityId: 1, spaceIds: [], startsAt: new Date("2025-05-26T18:00:00"), endsAt: new Date("2025-05-26T18:30:00") }],
    })[0].historicallyBookedYears).toEqual([1]);
  });

  it("records multi-space historical bookings for every listed space", () => {
    const otherSpace: SpaceLike = { ...baseSpace, id: 11, name: "Pool" };
    expect(firstWeekSpaces({
      ...historicalInput,
      spaces: [baseSpace, otherSpace],
      historicalBookings: [{ facilityId: 1, spaceIds: [10, 11], startsAt: new Date("2025-05-26T18:00:00"), endsAt: new Date("2025-05-26T18:30:00") }],
    })).toEqual([
      { spaceId: 10, available: true, historicallyBookedYears: [1] },
      { spaceId: 11, available: true, historicallyBookedYears: [1] },
    ]);
  });

  it("does not record history from a different facility", () => {
    expect(firstWeekSpaces({
      ...historicalInput,
      historicalBookings: [{ facilityId: 2, spaceIds: [], startsAt: new Date("2025-05-26T18:00:00"), endsAt: new Date("2025-05-26T18:30:00") }],
    })[0].historicallyBookedYears).toEqual([]);
  });

  it("does not mark the cell historical when only an unavailable sibling space has history", () => {
    const otherSpace: SpaceLike = { ...baseSpace, id: 11, name: "Pool" };
    const slot = mondaySlot({
      ...historicalInput,
      spaces: [baseSpace, otherSpace],
      bookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2026-05-25T18:00:00"), endsAt: new Date("2026-05-25T18:30:00") }],
      historicalBookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2025-05-26T18:00:00"), endsAt: new Date("2025-05-26T18:30:00") }],
    });

    expect(slot.weeks[0]).toEqual({
      date: "2026-05-25",
      available: true,
      spaces: [
        { spaceId: 10, available: false, historicallyBookedYears: [1] },
        { spaceId: 11, available: true, historicallyBookedYears: [] },
      ],
    });
    expect(hasHistoricalAvailableSpace(slot)).toBe(false);
    expect(hasLastYearHistoricalAvailableSpace(slot)).toBe(false);
  });

  it("marks the cell historical for last-year history but not two-years-ago-only history", () => {
    const lastYearSlot = mondaySlot({
      ...historicalInput,
      historicalBookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2025-05-26T18:00:00"), endsAt: new Date("2025-05-26T18:30:00") }],
    });
    const twoYearsAgoSlot = mondaySlot({
      ...historicalInput,
      historicalBookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2024-05-27T18:00:00"), endsAt: new Date("2024-05-27T18:30:00") }],
    });

    expect(hasLastYearHistoricalAvailableSpace(lastYearSlot)).toBe(true);
    expect(hasHistoricalAvailableSpace(twoYearsAgoSlot)).toBe(true);
    expect(hasLastYearHistoricalAvailableSpace(twoYearsAgoSlot)).toBe(false);
  });

  it("sets historical hatch intensity from last-year booked share", () => {
    const slotWithHistory = (days: number[]) => mondaySlot({
      ...baseInput,
      weeks: 5,
      historicalBookings: days.map((d) => ({
        facilityId: 1,
        spaceIds: [10],
        startsAt: new Date(`2025-06-${String(d).padStart(2, "0")}T19:00:00`),
        endsAt: new Date(`2025-06-${String(d).padStart(2, "0")}T19:30:00`),
      })),
    }, "19:00");

    expect(historicalHatchLevelForSlot(slotWithHistory([2]))).toBe("none");
    expect(historicalHatchLevelForSlot(slotWithHistory([2, 9]))).toBe("light");
    expect(historicalHatchLevelForSlot(slotWithHistory([2, 9, 16]))).toBe("light");
    expect(historicalHatchLevelForSlot(slotWithHistory([2, 9, 16, 23]))).toBe("strong");
  });

  it("counts last-year-booked weeks even when the space is booked again this year", () => {
    const slot = mondaySlot({
      ...baseInput,
      weeks: 5,
      bookings: [
        { facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-01T19:00:00"), endsAt: new Date("2026-06-01T19:30:00") },
        { facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-08T19:00:00"), endsAt: new Date("2026-06-08T19:30:00") },
      ],
      historicalBookings: [2, 9, 16, 23].map((d) => ({
        facilityId: 1,
        spaceIds: [10],
        startsAt: new Date(`2025-06-${String(d).padStart(2, "0")}T19:00:00`),
        endsAt: new Date(`2025-06-${String(d).padStart(2, "0")}T19:30:00`),
      })),
    }, "19:00");
    expect(historicalHatchLevelForSlot(slot)).toBe("strong");
  });
});
