import { describe, expect, it } from "vitest";
import { nearbySearchRequestSchema } from "../lib/api-contracts";

const validNearbySearch = {
  lat: 43.6532,
  lng: -79.3832,
  startDate: "2026-06-01",
  startTime: "18:00",
  endTime: "22:00",
  weeks: 8,
  spaceTypeId: 17,
  limit: 5,
};

describe("nearbySearchRequestSchema", () => {
  it("accepts a valid nearby search request", () => {
    expect(nearbySearchRequestSchema.safeParse(validNearbySearch).success).toBe(true);
  });

  it("rejects impossible calendar dates", () => {
    expect(nearbySearchRequestSchema.safeParse({
      ...validNearbySearch,
      startDate: "2026-99-99",
    }).success).toBe(false);

    expect(nearbySearchRequestSchema.safeParse({
      ...validNearbySearch,
      startDate: "2026-02-30",
    }).success).toBe(false);
  });

  it("rejects invalid time values", () => {
    expect(nearbySearchRequestSchema.safeParse({
      ...validNearbySearch,
      startTime: "24:00",
    }).success).toBe(false);

    expect(nearbySearchRequestSchema.safeParse({
      ...validNearbySearch,
      endTime: "18:60",
    }).success).toBe(false);
  });

  it("requires endTime to be after startTime", () => {
    expect(nearbySearchRequestSchema.safeParse({
      ...validNearbySearch,
      startTime: "18:00",
      endTime: "18:00",
    }).success).toBe(false);

    expect(nearbySearchRequestSchema.safeParse({
      ...validNearbySearch,
      startTime: "22:00",
      endTime: "18:00",
    }).success).toBe(false);
  });

  it("rejects nonpositive space type ids", () => {
    expect(nearbySearchRequestSchema.safeParse({
      ...validNearbySearch,
      spaceTypeId: 0,
    }).success).toBe(false);
  });
});
