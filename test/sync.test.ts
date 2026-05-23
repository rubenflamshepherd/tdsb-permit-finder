import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING_SYNC_EXCLUDED_FACILITY_IDS, parseFacilityIdList, resolveBookingSpaceIds } from "../lib/sync";

describe("parseFacilityIdList", () => {
  it("parses comma-separated positive integer ids", () => {
    expect(parseFacilityIdList("175, 314,660,769")).toEqual([175, 314, 660, 769]);
  });

  it("deduplicates ids and ignores invalid values", () => {
    expect(parseFacilityIdList("175,abc,175,0,-1,314.5,660")).toEqual([175, 660]);
  });

  it("keeps the known TDSB booking-sync exclusions explicit", () => {
    expect(DEFAULT_BOOKING_SYNC_EXCLUDED_FACILITY_IDS).toEqual([175, 314, 660, 769]);
  });
});

describe("resolveBookingSpaceIds", () => {
  const spaceMap = new Map<number, Map<string, number>>([
    [15, new Map([
      ["Cafetorium (Large)", 8421],
      ["Gym A", 8422],
      ["Room 101", 8423],
      ["Room 102", 8424],
      ["Studio, Black Box", 8425],
    ])],
    [7, new Map([["Gym A", 5119]])],
  ]);

  it("returns [id] for an exact single-label match", () => {
    expect(resolveBookingSpaceIds(15, "Cafetorium (Large)", spaceMap)).toEqual([8421]);
    expect(resolveBookingSpaceIds(15, "Room 101", spaceMap)).toEqual([8423]);
  });

  it("prefers a whole-label match over splitting, even when the name contains a comma", () => {
    expect(resolveBookingSpaceIds(15, "Studio, Black Box", spaceMap)).toEqual([8425]);
  });

  it("returns all resolved ids when every piece of a multi-space label maps", () => {
    expect(resolveBookingSpaceIds(15, "Room 101, Room 102", spaceMap)).toEqual([8423, 8424]);
    expect(resolveBookingSpaceIds(15, "Gym A, Room 101, Cafetorium (Large)", spaceMap)).toEqual([8422, 8423, 8421]);
  });

  it("drops unresolved pieces and returns the resolved subset", () => {
    expect(resolveBookingSpaceIds(15, "Room 101, Portable 1, Room 102", spaceMap)).toEqual([8423, 8424]);
  });

  it("returns an empty array when no piece resolves", () => {
    expect(resolveBookingSpaceIds(15, "Portable 1, Portable 2", spaceMap)).toEqual([]);
  });

  it("returns an empty array when the label is null, undefined, or empty", () => {
    expect(resolveBookingSpaceIds(15, null, spaceMap)).toEqual([]);
    expect(resolveBookingSpaceIds(15, undefined, spaceMap)).toEqual([]);
    expect(resolveBookingSpaceIds(15, "", spaceMap)).toEqual([]);
  });

  it("scopes lookups to the booking's facility (same name in a different facility is not used)", () => {
    expect(resolveBookingSpaceIds(15, "Gym A", spaceMap)).toEqual([8422]);
    expect(resolveBookingSpaceIds(7, "Gym A", spaceMap)).toEqual([5119]);
    expect(resolveBookingSpaceIds(7, "Cafetorium (Large)", spaceMap)).toEqual([]);
  });

  it("returns an empty array when the facility has no entry in the map", () => {
    expect(resolveBookingSpaceIds(999, "Gym A", spaceMap)).toEqual([]);
  });

  it("deduplicates repeated entries in the label", () => {
    expect(resolveBookingSpaceIds(15, "Room 101, Room 101", spaceMap)).toEqual([8423]);
  });
});
