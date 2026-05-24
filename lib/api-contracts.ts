import { z } from "zod";
import type { DaySchedule } from "./nearby-slots";

export const nearbySearchRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  weeks: z.number().int().min(1).max(26),
  spaceTypeId: z.number().int().optional(),
  limit: z.number().int().min(1).max(20).default(5),
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
  spaces: Array<{ id: number; name: string; type?: string | null; spaceTypeId?: number | null }>;
  distanceKm: number;
  schedule: DaySchedule[];
};

export type NearbySearchResponse = {
  schools: NearbySchool[];
  weekStart: string;
};
