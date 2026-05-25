import { isBefore } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type Interval = { start: Date; end: Date };

export const TDSB_TIME_ZONE = "America/Toronto";

export function parseLocalDateTime(value: string): Date {
  return fromZonedTime(value.replace(" ", "T"), TDSB_TIME_ZONE);
}

export function parseDateWithTime(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}`, TDSB_TIME_ZONE);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return isBefore(a.start, b.end) && isBefore(b.start, a.end);
}

export function dateOnly(value: Date): string {
  return formatInTimeZone(value, TDSB_TIME_ZONE, "yyyy-MM-dd");
}

export function formatTdsbTimestamp(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return formatInTimeZone(date, TDSB_TIME_ZONE, "h:mma MMM d, yyyy");
}
