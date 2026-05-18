import { addDays, format, isAfter, isBefore, parse, parseISO } from "date-fns";

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

export function expandOccurrences(startDate: string, endDate: string, weekdays: number[], startTime: string, endTime: string): Interval[] {
  const requested = new Set(weekdays);
  const out: Interval[] = [];
  let cursor = parseISO(startDate);
  const end = parseISO(endDate);
  while (!isAfter(cursor, end)) {
    const jsDay = cursor.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    if (requested.has(isoDay)) {
      const day = format(cursor, "yyyy-MM-dd");
      out.push({ start: parseDateWithTime(day, startTime), end: parseDateWithTime(day, endTime) });
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function dateOnly(value: Date): string {
  return format(value, "yyyy-MM-dd");
}
