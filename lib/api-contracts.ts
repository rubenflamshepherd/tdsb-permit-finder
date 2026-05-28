import { format, isValid, parse } from "date-fns";
import { z } from "zod";
import type { DaySchedule } from "./nearby-slots";

function isCalendarDate(value: string): boolean {
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

const dateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate, "Invalid calendar date");

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time");

export const nearbySearchRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  startDate: dateString,
  startTime: timeString,
  endTime: timeString,
  weeks: z.number().int().min(1).max(26),
  spaceTypeId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(20).default(5),
}).superRefine((value, ctx) => {
  if (timeToMinutes(value.endTime) <= timeToMinutes(value.startTime)) {
    ctx.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "End time must be after start time",
    });
  }
});

export type NearbySearchRequest = z.infer<typeof nearbySearchRequestSchema>;

export type NearbySchool = {
  facility: {
    id: number;
    name: string;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    pictureUrls?: string[];
  };
  spaces: Array<{
    id: number;
    name: string;
    type?: string | null;
    spaceTypeId?: number | null;
    areaSqft?: number | null;
    areaSqm?: number | null;
  }>;
  distanceKm: number;
  schedule: DaySchedule[];
};

export type NearbySearchResponse = {
  schools: NearbySchool[];
  weekStart: string;
};

export type SyncStatusResponse = {
  inventory: {
    lastSuccessfulSyncAt: string;
  } | null;
  bookings: {
    lastSuccessfulSyncAt: string;
  } | null;
};
