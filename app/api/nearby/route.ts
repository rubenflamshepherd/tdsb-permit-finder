import { format, parseISO, startOfWeek, addDays, addWeeks } from "date-fns";
import { NextResponse } from "next/server";
import { nearbySearchRequestSchema } from "@/lib/api-contracts";
import { distanceKm } from "@/lib/distance";
import { computeNearbySchedule } from "@/lib/nearby-slots";
import { facilityPictureUrls } from "@/lib/pictures";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const parsed = nearbySearchRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const search = parsed.data;
  const origin = { lat: search.lat, lng: search.lng };
  const weekStart = startOfWeek(parseISO(search.startDate), { weekStartsOn: 1 });
  const rangeStart = weekStart;
  const rangeEnd = addDays(addWeeks(weekStart, search.weeks), 1);

  const candidateSpaces = await prisma.space.findMany({
    where: {
      isAvailable: true,
      hideFromPublic: false,
      ...(search.spaceTypeId ? { spaceTypeId: search.spaceTypeId } : {}),
      facility: { latitude: { not: null }, longitude: { not: null } },
    },
    include: { facility: true },
    take: 10000,
  });

  const facilityMap = new Map<number, {
    facility: (typeof candidateSpaces)[number]["facility"];
    spaces: typeof candidateSpaces;
    distanceKm: number;
  }>();

  for (const space of candidateSpaces) {
    if (space.facility.latitude == null || space.facility.longitude == null) continue;
    const existing = facilityMap.get(space.facilityId);
    if (existing) {
      existing.spaces.push(space);
      continue;
    }
    facilityMap.set(space.facilityId, {
      facility: space.facility,
      spaces: [space],
      distanceKm: distanceKm(origin, { lat: space.facility.latitude, lng: space.facility.longitude }),
    });
  }

  const nearest = [...facilityMap.values()].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, search.limit);
  const facilityIds = nearest.map((row) => row.facility.id);

  const [bookings, specialDates] = await Promise.all([
    prisma.booking.findMany({
      where: {
        facilityId: { in: facilityIds },
        startsAt: { lte: rangeEnd },
        endsAt: { gte: rangeStart },
      },
    }),
    prisma.specialDate.findMany({
      where: {
        facilityId: { in: facilityIds },
        startsOn: { lte: rangeEnd },
        endsOn: { gte: rangeStart },
      },
    }),
  ]);

  const schools = nearest.map(({ facility, spaces, distanceKm: km }) => {
    const schedule = computeNearbySchedule({
      startDate: search.startDate,
      startTime: search.startTime,
      endTime: search.endTime,
      weeks: search.weeks,
      spaces,
      facilityHours: facility.hoursJson,
      bookings: bookings.filter((b) => b.facilityId === facility.id),
      specialDates: specialDates.filter((s) => s.facilityId === facility.id),
    });

    return {
      facility: {
        id: facility.id,
        name: facility.name,
        address: facility.address,
        city: facility.city,
        postalCode: facility.postalCode,
        latitude: facility.latitude,
        longitude: facility.longitude,
        pictureUrls: facilityPictureUrls(facility.pictureFilenames),
      },
      spaces: spaces.map((space) => ({ id: space.id, name: space.name, type: space.type, spaceTypeId: space.spaceTypeId })),
      distanceKm: km,
      schedule,
    };
  });

  return NextResponse.json({ schools, weekStart: format(weekStart, "yyyy-MM-dd") });
}
