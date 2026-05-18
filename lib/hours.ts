import { format } from "date-fns";
import { Interval, parseDateWithTime } from "./time";

type DayHours = { start?: string; end?: string };
type HoursMap = Record<string, DayHours>;

function parseHours(raw: unknown): HoursMap | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as HoursMap;
  if (typeof raw !== "string" || raw.trim() === "" || raw.trim() === "[]") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as HoursMap) : null;
  } catch {
    return null;
  }
}

function normalizeTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2];
  const ampm = match[3]?.toLowerCase();
  if (ampm === "pm" && hour !== 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function withinHours(interval: Interval, spaceHours: unknown, facilityHours: unknown): boolean {
  const hours = parseHours(spaceHours) ?? parseHours(facilityHours);
  if (!hours) return true;
  const jsDay = interval.start.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  const dayHours = hours[String(isoDay)];
  if (!dayHours?.start || !dayHours?.end) return false;
  const date = format(interval.start, "yyyy-MM-dd");
  const start = normalizeTime(dayHours.start);
  const end = normalizeTime(dayHours.end);
  if (!start || !end) return true;
  const allowed = { start: parseDateWithTime(date, start), end: parseDateWithTime(date, end) };
  return interval.start >= allowed.start && interval.end <= allowed.end;
}
