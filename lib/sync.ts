import { Prisma } from "@prisma/client";
import { addDays, format } from "date-fns";
import { prisma } from "./prisma";
import { decodeHtmlEntities } from "./html-entities";
import { TdsbClient, TdsbFacility, TdsbSpace, TdsbSpaceDetails } from "./tdsb-client";

export const DEFAULT_BOOKING_SYNC_EXCLUDED_FACILITY_IDS = [175, 314, 660, 769];

export function parseFacilityIdList(value?: string | null): number[] {
  if (value == null) return [];
  return [...new Set(value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0))];
}

function bookingSyncExcludedFacilityIds(): number[] {
  return parseFacilityIdList(process.env.BOOKING_SYNC_EXCLUDED_FACILITY_IDS ?? DEFAULT_BOOKING_SYNC_EXCLUDED_FACILITY_IDS.join(","));
}

export function resolveBookingSpaceIds(
  facilityId: number,
  spacesLabel: string | null | undefined,
  spaceMap: Map<number, Map<string, number>>,
): number[] {
  if (!spacesLabel) return [];
  const names = spaceMap.get(facilityId);
  if (!names) return [];
  const whole = names.get(spacesLabel);
  if (whole != null) return [whole];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const part of spacesLabel.split(", ")) {
    const id = names.get(part);
    if (id != null && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseJsonish(raw?: string | null): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (!raw || raw === "[]") return undefined;
  try { return toJson(JSON.parse(raw)); } catch { return toJson(raw); }
}

function parseLocalDateTime(value: string): Date {
  return new Date(value.replace(" ", "T"));
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  let cursor = 0;
  const out: R[] = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  }));
  return out;
}

function facilityRow(f: TdsbFacility, pictureFilenames: string[] = []) {
  return {
    id: f.id,
    name: f.name,
    address: decodeHtmlEntities(f.address),
    suite: decodeHtmlEntities(f.suite),
    city: decodeHtmlEntities(f.city),
    province: f.province,
    postalCode: f.postal_code,
    phone: f.phone,
    regionId: f.region_id,
    region: f.region,
    latitude: f.latitude,
    longitude: f.longitude,
    hoursJson: parseJsonish(f.hours),
    pictureFilenames: pictureFilenames.length ? toJson(pictureFilenames) : undefined,
    rawJson: toJson(f),
    lastSyncedAt: new Date(),
  };
}

function spaceRow(s: TdsbSpace, details?: TdsbSpaceDetails) {
  return {
    id: Number(s.id),
    facilityId: Number(s.school_id),
    spaceTypeId: s.space_type_id ? Number(s.space_type_id) : null,
    name: s.name,
    type: s.type,
    isAvailable: s.is_available === "1",
    isAvailableReg: s.is_available_reg === "1",
    hideFromPublic: s.hide_from_public === "1",
    areaSqm: details?.areaSqm,
    areaSqft: details?.areaSqft,
    hoursJson: parseJsonish(s.hours),
    detailAttributes: details && Object.keys(details.attributes).length ? toJson(details.attributes) : undefined,
    pictureFilenames: details?.pictureFilenames.length ? toJson(details.pictureFilenames) : undefined,
    rawJson: toJson(s),
    lastSyncedAt: new Date(),
  };
}

export async function syncInventory(permitTypeId = 3) {
  const client = new TdsbClient();
  const concurrency = Number(process.env.SYNC_CONCURRENCY ?? 12);
  const [spaceTypes, facilities] = await Promise.all([client.spaceTypes(permitTypeId), client.facilities(permitTypeId)]);

  const perFacility = await mapLimit(facilities, concurrency, async (facility, index) => {
    const result = { spaces: [] as TdsbSpace[], pictureFilenames: [] as string[] };
    try { result.spaces = await client.spaces(facility.id); }
    catch (error) {
      console.warn(`failed to fetch spaces for facility ${facility.id} (${facility.name}):`, error instanceof Error ? error.message : error);
    }
    try { result.pictureFilenames = await client.facilityPictures(facility.id); }
    catch (error) {
      console.warn(`failed to fetch pictures for facility ${facility.id} (${facility.name}):`, error instanceof Error ? error.message : error);
    }
    if ((index + 1) % 50 === 0) console.log(`fetched inventory for ${index + 1}/${facilities.length} facilities`);
    return result;
  });
  const spaces = perFacility.flatMap((r) => r.spaces);
  const detailConcurrency = Number(process.env.SPACE_DETAIL_SYNC_CONCURRENCY ?? 6);
  const publicSpaces = spaces.filter((space) => space.hide_from_public !== "1");
  const detailPairs = await mapLimit(publicSpaces, detailConcurrency, async (space, index) => {
    let details: TdsbSpaceDetails | undefined;
    try { details = await client.spaceDetails(Number(space.id)); }
    catch (error) {
      console.warn(`failed to fetch details for space ${space.id} (${space.name}):`, error instanceof Error ? error.message : error);
    }
    if ((index + 1) % 100 === 0) console.log(`fetched details for ${index + 1}/${publicSpaces.length} spaces`);
    return [Number(space.id), details] as const;
  });
  const detailsBySpaceId = new Map<number, TdsbSpaceDetails>();
  for (const [spaceId, details] of detailPairs) if (details) detailsBySpaceId.set(spaceId, details);
  const picturesByFacilityId = new Map<number, string[]>();
  perFacility.forEach((r, index) => picturesByFacilityId.set(facilities[index].id, r.pictureFilenames));
  const facilitiesWithPictures = perFacility.filter((r) => r.pictureFilenames.length > 0).length;
  console.log(`pictures found for ${facilitiesWithPictures}/${facilities.length} facilities`);
  console.log(`details found for ${detailsBySpaceId.size}/${publicSpaces.length} spaces`);

  const typeMap = new Map<number, { id: number; name: string; requestByQty: boolean; rawJson: Prisma.InputJsonValue; lastSyncedAt: Date }>();
  for (const st of spaceTypes) typeMap.set(Number(st.id), { id: Number(st.id), name: st.name, requestByQty: st.request_by_qty === "1", rawJson: toJson(st), lastSyncedAt: new Date() });
  for (const space of spaces) {
    if (!space.space_type_id) continue;
    const id = Number(space.space_type_id);
    if (!typeMap.has(id)) typeMap.set(id, { id, name: space.type ?? `Space type ${id}`, requestByQty: false, rawJson: toJson({ id, name: space.type, inferred_from_space: true }), lastSyncedAt: new Date() });
  }

  await prisma.$transaction([prisma.booking.deleteMany(), prisma.specialDate.deleteMany(), prisma.space.deleteMany(), prisma.facility.deleteMany(), prisma.spaceType.deleteMany()]);
  for (const group of chunks([...typeMap.values()], 500)) await prisma.spaceType.createMany({ data: group });
  for (const group of chunks(facilities.map((f) => facilityRow(f, picturesByFacilityId.get(f.id))), 500)) await prisma.facility.createMany({ data: group });
  for (const group of chunks(spaces.map((space) => spaceRow(space, detailsBySpaceId.get(Number(space.id)))), 500)) await prisma.space.createMany({ data: group });

  return { spaceTypes: typeMap.size, facilities: facilities.length, spaces: spaces.length, spaceDetails: detailsBySpaceId.size };
}

export async function syncBookings(startDate?: string, endDate?: string, facilityIds?: number[]) {
  const client = new TdsbClient();
  const start = startDate ?? format(new Date(), "yyyy-MM-dd");
  const end = endDate ?? format(addDays(new Date(), Number(process.env.BOOKING_SYNC_DAYS ?? 180)), "yyyy-MM-dd");
  const concurrency = Number(process.env.SYNC_CONCURRENCY ?? 12);
  const excludedFacilityIds = new Set(bookingSyncExcludedFacilityIds());
  const allFacilities = facilityIds?.length ? facilityIds.map((id) => ({ id })) : await prisma.facility.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  const facilities = allFacilities.filter((facility) => !excludedFacilityIds.has(facility.id));
  const skippedFacilities = allFacilities.length - facilities.length;
  if (skippedFacilities > 0) console.log(`skipping ${skippedFacilities} booking sync facilities: ${[...excludedFacilityIds].sort((a, b) => a - b).join(", ")}`);

  const results = await mapLimit(facilities, concurrency, async (facility, index) => {
    const result = { facilityId: facility.id, bookings: [] as Awaited<ReturnType<TdsbClient["bookings"]>>, specialDates: [] as Awaited<ReturnType<TdsbClient["specialDates"]>>, failed: false };
    try { result.bookings = await client.bookings(facility.id, `${start} 00:00:00`, `${end} 23:59:59`, 0); }
    catch (error) { result.failed = true; console.warn(`failed bookings for facility ${facility.id}:`, error instanceof Error ? error.message : error); }
    try { result.specialDates = await client.specialDates(facility.id, `${start} 00:00:00`, `${end} 23:59:59`); }
    catch (error) { result.failed = true; console.warn(`failed special dates for facility ${facility.id}:`, error instanceof Error ? error.message : error); }
    if ((index + 1) % 50 === 0) console.log(`fetched bookings/special dates for ${index + 1}/${facilities.length} facilities`);
    return result;
  });

  const spaceRows = await prisma.space.findMany({
    where: { facilityId: { in: facilities.map((f) => f.id) } },
    select: { id: true, facilityId: true, name: true },
    orderBy: { id: "asc" },
  });
  const spaceMap = new Map<number, Map<string, number>>();
  for (const row of spaceRows) {
    let names = spaceMap.get(row.facilityId);
    if (!names) { names = new Map(); spaceMap.set(row.facilityId, names); }
    if (names.has(row.name)) console.warn(`duplicate space name "${row.name}" at facility ${row.facilityId}; keeping space id ${names.get(row.name)}, ignoring ${row.id}`);
    else names.set(row.name, row.id);
  }

  const bookings = results.flatMap((r) => r.bookings.map((b) => ({
    id: String(b.id),
    facilityId: r.facilityId,
    spaceIds: resolveBookingSpaceIds(r.facilityId, b.spaces, spaceMap),
    startsAt: parseLocalDateTime(b.start),
    endsAt: parseLocalDateTime(b.end),
    statusId: b.status_id == null ? null : Number(b.status_id),
    purpose: b.purpose,
    spacesLabel: b.spaces,
    rawJson: toJson(b),
    lastSyncedAt: new Date(),
  })));
  const singleSpace = bookings.filter((b) => b.spaceIds.length === 1).length;
  const multiSpace = bookings.filter((b) => b.spaceIds.length > 1).length;
  const empty = bookings.length - singleSpace - multiSpace;
  console.log(`resolved spaceIds: ${singleSpace} single + ${multiSpace} multi-space = ${singleSpace + multiSpace}/${bookings.length} bookings (${empty} empty → facility-level fallback)`);
  const specialDates = results.flatMap((r) => r.specialDates.map((s) => ({
    id: `${r.facilityId}:${s.id}`,
    facilityId: r.facilityId,
    startsOn: parseLocalDateTime(`${s.start} 00:00:00`),
    endsOn: parseLocalDateTime(`${s.end} 23:59:59`),
    reason: s.reason,
    rawJson: toJson(s),
    lastSyncedAt: new Date(),
  })));

  await prisma.$transaction([prisma.booking.deleteMany(), prisma.specialDate.deleteMany()]);
  for (const group of chunks(bookings, 1000)) await prisma.booking.createMany({ data: group, skipDuplicates: true });
  for (const group of chunks(specialDates, 1000)) await prisma.specialDate.createMany({ data: group, skipDuplicates: true });

  return { facilities: facilities.length, skippedFacilities, bookings: bookings.length, specialDates: specialDates.length, failures: results.filter((r) => r.failed).length, startDate: start, endDate: end };
}
