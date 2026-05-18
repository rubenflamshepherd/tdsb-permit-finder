import { z } from "zod";
import type { AvailabilityResult } from "./availability";
import type { DaySchedule } from "./nearby-slots";

export const availabilitySearchRequestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  spaceTypeIds: z.array(z.number().int()).optional(),
  facilityIds: z.array(z.number().int()).optional(),
  near: z.object({ lat: z.number(), lng: z.number(), radiusKm: z.number().positive() }).optional(),
  matchMode: z.enum(["all", "partial"]).default("all"),
});

export const nearbySearchRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  weeks: z.number().int().min(1).max(26),
  spaceTypeId: z.number().int().optional(),
});

export type AvailabilitySearchRequest = z.infer<typeof availabilitySearchRequestSchema>;

export type AvailabilitySearchResponse = {
  results: AvailabilityResult[];
  total: number;
};

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
  spaces: Array<{ id: number; name: string; type?: string | null; spaceTypeId?: number | null }>;
  distanceKm: number;
  schedule: DaySchedule[];
};

export type NearbySearchResponse = {
  schools: NearbySchool[];
  weekStart: string;
};
