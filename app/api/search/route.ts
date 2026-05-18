import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { availabilitySearchRequestSchema } from "@/lib/api-contracts";
import { computeAvailability } from "@/lib/availability";
import { parseDateWithTime } from "@/lib/time";

export async function POST(request: Request) {
  const parsed = availabilitySearchRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const search = parsed.data;
  const startsAt = parseDateWithTime(search.startDate, "00:00");
  const endsAt = parseDateWithTime(search.endDate, "23:59");

  const spaces = await prisma.space.findMany({
    where: {
      isAvailable: true,
      hideFromPublic: false,
      ...(search.spaceTypeIds?.length ? { spaceTypeId: { in: search.spaceTypeIds } } : {}),
      ...(search.facilityIds?.length ? { facilityId: { in: search.facilityIds } } : {}),
    },
    include: { facility: true },
    take: 5000,
  });

  const facilityIds = [...new Set(spaces.map((s) => s.facilityId))];
  const [bookings, specialDates] = await Promise.all([
    prisma.booking.findMany({ where: { facilityId: { in: facilityIds }, startsAt: { lte: endsAt }, endsAt: { gte: startsAt } } }),
    prisma.specialDate.findMany({ where: { facilityId: { in: facilityIds }, startsOn: { lte: endsAt }, endsOn: { gte: startsAt } } }),
  ]);

  const results = computeAvailability({ search, spaces, bookings, specialDates });
  return NextResponse.json({ results: results.slice(0, 250), total: results.length });
}
