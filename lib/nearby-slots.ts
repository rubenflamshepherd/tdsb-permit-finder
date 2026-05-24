import { addDays, addWeeks, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { withinHours } from "./hours";
import { dateOnly, Interval, overlaps, parseDateWithTime } from "./time";

export type FacilityLike = {
  id: number; name: string; address?: string | null; city?: string | null; postalCode?: string | null;
  latitude?: number | null; longitude?: number | null; hoursJson?: unknown;
};
export type SpaceLike = {
  id: number; facilityId: number; spaceTypeId?: number | null; name: string; type?: string | null;
  isAvailable: boolean; hideFromPublic: boolean; hoursJson?: unknown; facility: FacilityLike;
};
export type BookingLike = { spaceIds: number[]; facilityId: number; startsAt: Date; endsAt: Date; purpose?: string | null };
export type SpecialDateLike = { facilityId: number; startsOn: Date; endsOn: Date; reason?: string | null };

export type SlotStatus = "available" | "mostly" | "limited" | "unavailable";
export type HistoricalHatchLevel = "none" | "light" | "strong";
export type DayStatus = "available" | "partial" | "unavailable";

export type ScheduleWeekSpace = {
  spaceId: number;
  available: boolean;
  historicallyBookedYears: number[];
};

export type ScheduleWeek = {
  date: string;
  available: boolean;
  spaces: ScheduleWeekSpace[];
};

export type ScheduleSlot = {
  start: string;
  end: string;
  availableWeeks: number;
  totalWeeks: number;
  status: SlotStatus;
  weeks: ScheduleWeek[];
};

export type DaySchedule = {
  day: number;
  label: string;
  status: DayStatus;
  availableWeeks: number;
  totalWeeks: number;
  slots: ScheduleSlot[];
  dates: Array<{ date: string; available: boolean }>;
};

export type NearbyScheduleInput = {
  startDate: string;
  startTime: string;
  endTime: string;
  weeks: number;
  spaces: SpaceLike[];
  facilityHours: unknown;
  bookings: BookingLike[];
  historicalBookings?: BookingLike[];
  specialDates: SpecialDateLike[];
};

const WEEKDAYS: ReadonlyArray<{ day: number; label: string }> = [
  { day: 1, label: "Mon" }, { day: 2, label: "Tue" }, { day: 3, label: "Wed" },
  { day: 4, label: "Thu" }, { day: 5, label: "Fri" }, { day: 6, label: "Sat" }, { day: 7, label: "Sun" },
];

const SLOT_MINUTES = 30;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function enumerateSlots(startTime: string, endTime: string, slotMinutes = SLOT_MINUTES): Array<{ start: string; end: string }> {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  if (endMin <= startMin) return [];
  const out: Array<{ start: string; end: string }> = [];
  for (let cursor = startMin; cursor < endMin; cursor += slotMinutes) {
    out.push({ start: minutesToTime(cursor), end: minutesToTime(Math.min(cursor + slotMinutes, endMin)) });
  }
  return out;
}

function specialDateBlocks(interval: Interval, specialDates: SpecialDateLike[]): boolean {
  const day = dateOnly(interval.start);
  return specialDates.some((s) => {
    const start = dateOnly(s.startsOn);
    const end = dateOnly(s.endsOn);
    return day >= start && day <= end;
  });
}

function statusFromCounts(availableWeeks: number, totalWeeks: number): SlotStatus {
  const availability = availableWeeks / totalWeeks;
  if (availability > 0.8) return "available";
  if (availability >= 0.6) return "mostly";
  if (availability >= 0.4) return "limited";
  return "unavailable";
}

function bookingMatchesSpace(booking: BookingLike, space: SpaceLike): boolean {
  return booking.spaceIds.length > 0 ? booking.spaceIds.includes(space.id) : booking.facilityId === space.facilityId;
}

function historicallyBookedYears(space: SpaceLike, interval: Interval, historicalBookings: BookingLike[]): number[] {
  return [1, 2].filter((yearsBack) => {
    const shiftedInterval = {
      start: subWeeks(interval.start, 52 * yearsBack),
      end: subWeeks(interval.end, 52 * yearsBack),
    };
    return historicalBookings.some((booking) => (
      bookingMatchesSpace(booking, space)
      && overlaps(shiftedInterval, { start: booking.startsAt, end: booking.endsAt })
    ));
  });
}

export function hasHistoricalAvailableSpace(slot: Pick<ScheduleSlot, "weeks">): boolean {
  return slot.weeks.some((week) => week.spaces.some((space) => space.available && space.historicallyBookedYears.length > 0));
}

export function hasLastYearHistoricalAvailableSpace(slot: Pick<ScheduleSlot, "weeks">): boolean {
  return slot.weeks.some((week) => week.spaces.some((space) => (
    space.available
    && space.historicallyBookedYears.includes(1)
  )));
}

export function historicalHatchLevelForSlot(slot: Pick<ScheduleSlot, "weeks" | "totalWeeks">): HistoricalHatchLevel {
  const lastYearBookedWeeks = slot.weeks.filter((week) => (
    week.spaces.some((space) => space.historicallyBookedYears.includes(1))
  )).length;
  const lastYearBookedRatio = lastYearBookedWeeks / slot.totalWeeks;
  if (lastYearBookedRatio > 0.6) return "strong";
  if (lastYearBookedRatio >= 0.4) return "light";
  return "none";
}

export function computeNearbySchedule(input: NearbyScheduleInput): DaySchedule[] {
  const weekStart = startOfWeek(parseISO(input.startDate), { weekStartsOn: 1 });
  const slotTemplate = enumerateSlots(input.startTime, input.endTime);
  const historicalBookings = input.historicalBookings ?? [];

  return WEEKDAYS.map(({ day, label }) => {
    const slotWeeks: ScheduleSlot["weeks"][] = slotTemplate.map(() => []);
    const dates: DaySchedule["dates"] = [];

    for (let week = 0; week < input.weeks; week += 1) {
      const date = format(addDays(addWeeks(weekStart, week), day - 1), "yyyy-MM-dd");
      let dayFullyFree = slotTemplate.length > 0;

      slotTemplate.forEach((slot, idx) => {
        const interval: Interval = { start: parseDateWithTime(date, slot.start), end: parseDateWithTime(date, slot.end) };
        const spaces = input.spaces.map((space) => {
          let available = true;
          if (specialDateBlocks(interval, input.specialDates)) available = false;
          if (available && !withinHours(interval, space.hoursJson, input.facilityHours)) available = false;
          if (available) {
            const bookingsForSpace = input.bookings.filter((booking) => bookingMatchesSpace(booking, space));
            available = !bookingsForSpace.some((booking) => overlaps(interval, { start: booking.startsAt, end: booking.endsAt }));
          }
          return {
            spaceId: space.id,
            available,
            historicallyBookedYears: historicallyBookedYears(space, interval, historicalBookings),
          };
        });
        const free = spaces.some((space) => space.available);
        slotWeeks[idx].push({ date, available: free, spaces });
        if (!free) dayFullyFree = false;
      });

      dates.push({ date, available: dayFullyFree });
    }

    const slots: ScheduleSlot[] = slotTemplate.map((slot, idx) => {
      const weeks = slotWeeks[idx];
      const availableWeeks = weeks.filter((w) => w.available).length;
      return {
        start: slot.start,
        end: slot.end,
        availableWeeks,
        totalWeeks: input.weeks,
        status: statusFromCounts(availableWeeks, input.weeks),
        weeks,
      };
    });

    const availableWeeks = dates.filter((d) => d.available).length;
    const dayStatus: DayStatus = availableWeeks === input.weeks ? "available" : availableWeeks === 0 ? "unavailable" : "partial";

    return { day, label, status: dayStatus, availableWeeks, totalWeeks: input.weeks, slots, dates };
  });
}
