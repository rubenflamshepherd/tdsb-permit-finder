import { addDays, addWeeks, format, parseISO, startOfWeek } from "date-fns";
import type { BookingLike, SpaceLike, SpecialDateLike } from "./availability";
import { withinHours } from "./hours";
import { dateOnly, Interval, overlaps, parseDateWithTime } from "./time";

export type SlotStatus = "available" | "rare" | "frequent" | "unavailable";
export type DayStatus = "available" | "partial" | "unavailable";

export type ScheduleSlot = {
  start: string;
  end: string;
  availableWeeks: number;
  totalWeeks: number;
  status: SlotStatus;
  weeks: Array<{ date: string; available: boolean }>;
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
  const blocked = totalWeeks - availableWeeks;
  if (blocked === 0) return "available";
  if (blocked >= totalWeeks) return "unavailable";
  if (blocked === 1) return "rare";
  return "frequent";
}

export function computeNearbySchedule(input: NearbyScheduleInput): DaySchedule[] {
  const weekStart = startOfWeek(parseISO(input.startDate), { weekStartsOn: 1 });
  const slotTemplate = enumerateSlots(input.startTime, input.endTime);

  return WEEKDAYS.map(({ day, label }) => {
    const slotWeeks: Array<Array<{ date: string; available: boolean }>> = slotTemplate.map(() => []);
    const dates: DaySchedule["dates"] = [];

    for (let week = 0; week < input.weeks; week += 1) {
      const date = format(addDays(addWeeks(weekStart, week), day - 1), "yyyy-MM-dd");
      let dayFullyFree = slotTemplate.length > 0;

      slotTemplate.forEach((slot, idx) => {
        const interval: Interval = { start: parseDateWithTime(date, slot.start), end: parseDateWithTime(date, slot.end) };
        const free = input.spaces.some((space) => {
          if (specialDateBlocks(interval, input.specialDates)) return false;
          if (!withinHours(interval, space.hoursJson, input.facilityHours)) return false;
          const bookingsForSpace = input.bookings.filter((b) => (b.spaceId ? b.spaceId === space.id : b.facilityId === space.facilityId));
          return !bookingsForSpace.some((b) => overlaps(interval, { start: b.startsAt, end: b.endsAt }));
        });
        slotWeeks[idx].push({ date, available: free });
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
