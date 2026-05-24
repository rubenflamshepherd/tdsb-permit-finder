import { format, isBefore, parse } from "date-fns";

export type Interval = { start: Date; end: Date };

export function parseLocalDateTime(value: string): Date {
  return parse(value, "yyyy-MM-dd HH:mm:ss", new Date());
}

export function parseDateWithTime(date: string, time: string): Date {
  return parse(`${date} ${time}`, "yyyy-MM-dd HH:mm", new Date());
}

export function overlaps(a: Interval, b: Interval): boolean {
  return isBefore(a.start, b.end) && isBefore(b.start, a.end);
}

export function dateOnly(value: Date): string {
  return format(value, "yyyy-MM-dd");
}
