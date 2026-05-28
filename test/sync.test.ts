import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOKING_SYNC_EXCLUDED_FACILITY_IDS,
  bookingSyncReplacementWhere,
  bookingSyncSuccessfulFacilityIds,
  parseFacilityIdList,
  resolveBookingSpaces,
  resolveBookingSpaceIds,
} from "../lib/sync";
import {
  BOOKINGS_SYNC_STATUS_KEY,
  INVENTORY_SYNC_STATUS_KEY,
  buildSyncStatusResponse,
} from "../lib/sync-status";
import { parseLocalDateTime } from "../lib/time";

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
      ["Gymnasium Double - 1 & 2", 8426],
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

  it("resolves multi-space labels when a space name contains a comma", () => {
    expect(resolveBookingSpaceIds(15, "Studio, Black Box, Room 101", spaceMap)).toEqual([8425, 8423]);
  });

  it("decodes HTML entities in booking labels before matching space names", () => {
    expect(resolveBookingSpaceIds(15, "Gymnasium Double - 1 &amp; 2", spaceMap)).toEqual([8426]);
    expect(resolveBookingSpaceIds(15, "Gymnasium Double - 1 &amp; 2, Room 101", spaceMap)).toEqual([8426, 8423]);
  });

  it("returns decoded unresolved labels when a booking label cannot be matched", () => {
    expect(resolveBookingSpaces(15, "Gymnasium Double - 1 &amp; 3", spaceMap)).toEqual({
      spaceIds: [],
      unresolvedLabels: ["Gymnasium Double - 1 & 3"],
    });
  });

  it("falls back to facility-level blocking when any piece of a multi-space label is unresolved", () => {
    expect(resolveBookingSpaceIds(15, "Room 101, Portable 1, Room 102", spaceMap)).toEqual([]);
    expect(resolveBookingSpaces(15, "Room 101, Portable 1, Room 102", spaceMap)).toEqual({
      spaceIds: [],
      unresolvedLabels: ["Portable 1"],
    });
  });

  it("returns an empty array when no piece resolves", () => {
    expect(resolveBookingSpaceIds(15, "Portable 1, Portable 2", spaceMap)).toEqual([]);
    expect(resolveBookingSpaces(15, "Portable 1, Portable 2", spaceMap)).toEqual({
      spaceIds: [],
      unresolvedLabels: ["Portable 1", "Portable 2"],
    });
  });

  it("returns an empty array when the label is null, undefined, or empty", () => {
    expect(resolveBookingSpaceIds(15, null, spaceMap)).toEqual([]);
    expect(resolveBookingSpaceIds(15, undefined, spaceMap)).toEqual([]);
    expect(resolveBookingSpaceIds(15, "", spaceMap)).toEqual([]);
    expect(resolveBookingSpaces(15, null, spaceMap)).toEqual({ spaceIds: [], unresolvedLabels: [] });
  });

  it("scopes lookups to the booking's facility (same name in a different facility is not used)", () => {
    expect(resolveBookingSpaceIds(15, "Gym A", spaceMap)).toEqual([8422]);
    expect(resolveBookingSpaceIds(7, "Gym A", spaceMap)).toEqual([5119]);
    expect(resolveBookingSpaceIds(7, "Cafetorium (Large)", spaceMap)).toEqual([]);
  });

  it("returns an empty array when the facility has no entry in the map", () => {
    expect(resolveBookingSpaceIds(999, "Gym A", spaceMap)).toEqual([]);
    expect(resolveBookingSpaces(999, "Gym A", spaceMap)).toEqual({
      spaceIds: [],
      unresolvedLabels: ["Gym A"],
    });
  });

  it("deduplicates repeated entries in the label", () => {
    expect(resolveBookingSpaceIds(15, "Room 101, Room 101", spaceMap)).toEqual([8423]);
  });
});

describe("booking sync replacement planning", () => {
  it("refreshes only facilities whose fetches fully succeeded", () => {
    expect(bookingSyncSuccessfulFacilityIds([
      { facilityId: 101, failed: false },
      { facilityId: 102, failed: true },
      { facilityId: 103, failed: false },
    ])).toEqual([101, 103]);
  });

  it("scopes destructive replacement to successful facilities and the requested window", () => {
    expect(bookingSyncReplacementWhere([101, 103], "2026-06-01", "2026-06-30")).toEqual({
      booking: {
        facilityId: { in: [101, 103] },
        startsAt: { lte: parseLocalDateTime("2026-06-30 23:59:59") },
        endsAt: { gte: parseLocalDateTime("2026-06-01 00:00:00") },
      },
      specialDate: {
        facilityId: { in: [101, 103] },
        startsOn: { lte: parseLocalDateTime("2026-06-30 23:59:59") },
        endsOn: { gte: parseLocalDateTime("2026-06-01 00:00:00") },
      },
    });
  });
});

describe("sync status keys", () => {
  it("exposes stable string keys for the inventory and bookings sync rows", () => {
    expect(INVENTORY_SYNC_STATUS_KEY).toBe("inventory");
    expect(BOOKINGS_SYNC_STATUS_KEY).toBe("bookings");
  });
});

describe("buildSyncStatusResponse", () => {
  const inventoryAt = new Date("2026-05-25T05:26:43Z");
  const bookingsAt = new Date("2026-05-28T11:50:00Z");

  it("maps inventory and bookings rows into the API response shape", () => {
    expect(
      buildSyncStatusResponse([
        { key: INVENTORY_SYNC_STATUS_KEY, lastSuccessfulSyncAt: inventoryAt },
        { key: BOOKINGS_SYNC_STATUS_KEY, lastSuccessfulSyncAt: bookingsAt },
      ]),
    ).toEqual({
      inventory: { lastSuccessfulSyncAt: inventoryAt.toISOString() },
      bookings: { lastSuccessfulSyncAt: bookingsAt.toISOString() },
    });
  });

  it("returns null entries for missing keys so the footer can render a fallback", () => {
    expect(buildSyncStatusResponse([])).toEqual({ inventory: null, bookings: null });
    expect(
      buildSyncStatusResponse([
        { key: INVENTORY_SYNC_STATUS_KEY, lastSuccessfulSyncAt: inventoryAt },
      ]),
    ).toEqual({
      inventory: { lastSuccessfulSyncAt: inventoryAt.toISOString() },
      bookings: null,
    });
  });

  it("ignores unknown keys so a stray row can't pollute the response", () => {
    expect(
      buildSyncStatusResponse([
        { key: "historical-bookings", lastSuccessfulSyncAt: bookingsAt },
      ]),
    ).toEqual({ inventory: null, bookings: null });
  });
});
