import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING_SYNC_EXCLUDED_FACILITY_IDS, parseFacilityIdList } from "../lib/sync";

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
