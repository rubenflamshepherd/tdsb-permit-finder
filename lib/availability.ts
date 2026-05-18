import { dateOnly, expandOccurrences, Interval, overlaps } from "./time";
import { withinHours } from "./hours";
import { distanceKm } from "./distance";
import type { AvailabilitySearchRequest } from "./api-contracts";

export type AvailabilitySearch = AvailabilitySearchRequest;

export type FacilityLike = {
  id: number; name: string; address?: string | null; city?: string | null; postalCode?: string | null;
  latitude?: number | null; longitude?: number | null; hoursJson?: unknown;
};
export type SpaceLike = {
  id: number; facilityId: number; spaceTypeId?: number | null; name: string; type?: string | null;
  isAvailable: boolean; hideFromPublic: boolean; hoursJson?: unknown; facility: FacilityLike;
};
export type BookingLike = { spaceId?: number | null; facilityId: number; startsAt: Date; endsAt: Date; purpose?: string | null };
export type SpecialDateLike = { facilityId: number; startsOn: Date; endsOn: Date; reason?: string | null };

export type AvailabilityResult = {
  facility: { id: number; name: string; address?: string | null; city?: string | null; postalCode?: string | null; latitude?: number | null; longitude?: number | null };
  space: { id: number; name: string; type?: string | null; spaceTypeId?: number | null };
  requestedOccurrences: number;
  availableOccurrences: number;
  availableWindows: Array<{ date: string; start: string; end: string }>;
  conflicts: Array<{ date: string; reason: "booking" | "special_date" | "outside_hours" }>;
  distanceKm?: number;
};

function specialDateBlocks(interval: Interval, specialDates: SpecialDateLike[]): boolean {
  const day = dateOnly(interval.start);
  return specialDates.some((s) => {
    const start = dateOnly(s.startsOn);
    const end = dateOnly(s.endsOn);
    return day >= start && day <= end;
  });
}

export function computeAvailability(input: {
  search: AvailabilitySearch;
  spaces: SpaceLike[];
  bookings: BookingLike[];
  specialDates: SpecialDateLike[];
}): AvailabilityResult[] {
  const occurrences = expandOccurrences(input.search.startDate, input.search.endDate, input.search.weekdays, input.search.startTime, input.search.endTime);
  const typeSet = input.search.spaceTypeIds?.length ? new Set(input.search.spaceTypeIds) : null;
  const facilitySet = input.search.facilityIds?.length ? new Set(input.search.facilityIds) : null;

  return input.spaces
    .filter((space) => space.isAvailable && !space.hideFromPublic)
    .filter((space) => !typeSet || (space.spaceTypeId != null && typeSet.has(space.spaceTypeId)))
    .filter((space) => !facilitySet || facilitySet.has(space.facilityId))
    .map((space) => {
      const facilitySpecialDates = input.specialDates.filter((s) => s.facilityId === space.facilityId);
      const relevantBookings = input.bookings.filter((b) => (b.spaceId ? b.spaceId === space.id : b.facilityId === space.facilityId));
      const availableWindows: AvailabilityResult["availableWindows"] = [];
      const conflicts: AvailabilityResult["conflicts"] = [];

      for (const occurrence of occurrences) {
        const day = dateOnly(occurrence.start);
        if (specialDateBlocks(occurrence, facilitySpecialDates)) {
          conflicts.push({ date: day, reason: "special_date" });
          continue;
        }
        if (!withinHours(occurrence, space.hoursJson, space.facility.hoursJson)) {
          conflicts.push({ date: day, reason: "outside_hours" });
          continue;
        }
        const hasBooking = relevantBookings.some((b) => overlaps(occurrence, { start: b.startsAt, end: b.endsAt }));
        if (hasBooking) {
          conflicts.push({ date: day, reason: "booking" });
          continue;
        }
        availableWindows.push({ date: day, start: input.search.startTime, end: input.search.endTime });
      }

      const distance = input.search.near && space.facility.latitude != null && space.facility.longitude != null
        ? distanceKm(input.search.near, { lat: space.facility.latitude, lng: space.facility.longitude })
        : undefined;

      return {
        facility: {
          id: space.facility.id,
          name: space.facility.name,
          address: space.facility.address,
          city: space.facility.city,
          postalCode: space.facility.postalCode,
          latitude: space.facility.latitude,
          longitude: space.facility.longitude,
        },
        space: { id: space.id, name: space.name, type: space.type, spaceTypeId: space.spaceTypeId },
        requestedOccurrences: occurrences.length,
        availableOccurrences: availableWindows.length,
        availableWindows,
        conflicts,
        distanceKm: distance,
      } satisfies AvailabilityResult;
    })
    .filter((r) => input.search.matchMode === "all" ? r.availableOccurrences === r.requestedOccurrences : r.availableOccurrences > 0)
    .filter((r) => input.search.near ? r.distanceKm != null && r.distanceKm <= input.search.near.radiusKm : true)
    .sort((a, b) => (b.availableOccurrences - a.availableOccurrences) || ((a.distanceKm ?? 0) - (b.distanceKm ?? 0)) || a.facility.name.localeCompare(b.facility.name));
}
