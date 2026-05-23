import { describe, expect, it } from "vitest";
import type { SpaceLike } from "../lib/availability";
import { computeNearbySchedule, enumerateSlots } from "../lib/nearby-slots";

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

  it("marks a slot 'rare' when blocked in exactly one week", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      bookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-08T19:00:00"), endsAt: new Date("2026-06-08T19:30:00") }],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("rare");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(3);
    expect(monday.slots.find((s) => s.start === "18:00")!.status).toBe("available");
  });

  it("marks a slot 'frequent' when blocked in multiple weeks but not all", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      bookings: [
        { facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-08T19:00:00"), endsAt: new Date("2026-06-08T19:30:00") },
        { facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-15T19:00:00"), endsAt: new Date("2026-06-15T19:30:00") },
      ],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("frequent");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(2);
  });

  it("marks a slot 'unavailable' when blocked in every week", () => {
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

  it("records per-week availability for each slot", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      bookings: [{ facilityId: 1, spaceIds: [10], startsAt: new Date("2026-06-15T19:00:00"), endsAt: new Date("2026-06-15T19:30:00") }],
    });
    const slot = schedule.find((d) => d.day === 1)!.slots.find((s) => s.start === "19:00")!;
    expect(slot.weeks).toEqual([
      { date: "2026-06-01", available: true },
      { date: "2026-06-08", available: true },
      { date: "2026-06-15", available: false },
      { date: "2026-06-22", available: true },
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
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("rare");
    expect(monday.slots.find((s) => s.start === "19:00")!.availableWeeks).toBe(3);
  });

  it("falls back to facility-wide blocking when spaceIds is empty", () => {
    const schedule = computeNearbySchedule({
      ...baseInput,
      bookings: [{ facilityId: 1, spaceIds: [], startsAt: new Date("2026-06-01T19:00:00"), endsAt: new Date("2026-06-01T19:30:00") }],
    });
    const monday = schedule.find((d) => d.day === 1)!;
    expect(monday.slots.find((s) => s.start === "19:00")!.status).toBe("rare");
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
    expect(monday.slots.every((s) => s.status === "rare")).toBe(true);
  });
});
