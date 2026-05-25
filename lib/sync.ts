import { Prisma } from "@prisma/client";
import { addDays, format, isBefore } from "date-fns";
import { prisma } from "./prisma";
import { decodeHtmlEntities } from "./html-entities";
import { INVENTORY_SYNC_STATUS_KEY } from "./sync-status";
import { TdsbClient, TdsbFacility, TdsbSpace, TdsbSpaceDetails } from "./tdsb-client";
import { parseLocalDateTime } from "./time";

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

export type BookingSpaceResolution = {
  spaceIds: number[];
  unresolvedLabels: string[];
};

function dedupeIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const deduped: number[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(id);
    }
  }
  return deduped;
}

const sortedSpaceNameEntriesCache = new WeakMap<Map<string, number>, Array<[string, number]>>();

function sortedSpaceNameEntries(names: Map<string, number>): Array<[string, number]> {
  const cached = sortedSpaceNameEntriesCache.get(names);
  if (cached) return cached;
  const entries = [...names.entries()].sort(([a], [b]) => b.length - a.length);
  sortedSpaceNameEntriesCache.set(names, entries);
  return entries;
}

function resolveKnownSpaceLabelSequence(spacesLabel: string, names: Map<string, number>): number[] | null {
  const entries = sortedSpaceNameEntries(names);
  const memo = new Map<number, number[] | null>();

  function resolveFrom(position: number): number[] | null {
    if (position === spacesLabel.length) return [];
    if (memo.has(position)) return memo.get(position) ?? null;

    for (const [name, id] of entries) {
      if (!spacesLabel.startsWith(name, position)) continue;

      const nextPosition = position + name.length;
      if (nextPosition === spacesLabel.length) {
        const resolved = [id];
        memo.set(position, resolved);
        return resolved;
      }
      if (!spacesLabel.startsWith(", ", nextPosition)) continue;

      const rest = resolveFrom(nextPosition + 2);
      if (rest) {
        const resolved = [id, ...rest];
        memo.set(position, resolved);
        return resolved;
      }
    }

    memo.set(position, null);
    return null;
  }

  return resolveFrom(0);
}

function unresolvedBookingSpaceLabels(spacesLabel: string, names: Map<string, number>): string[] {
  const parts = spacesLabel.split(", ");
  const unresolved: string[] = [];
  let index = 0;

  while (index < parts.length) {
    let matchedPartCount = 0;
    for (const name of names.keys()) {
      const nameParts = name.split(", ");
      if (nameParts.length <= matchedPartCount) continue;
      if (parts.slice(index, index + nameParts.length).join(", ") === name) {
        matchedPartCount = nameParts.length;
      }
    }

    if (matchedPartCount > 0) index += matchedPartCount;
    else {
      unresolved.push(parts[index]);
      index += 1;
    }
  }

  return [...new Set(unresolved)];
}

export function resolveBookingSpaces(
  facilityId: number,
  spacesLabel: string | null | undefined,
  spaceMap: Map<number, Map<string, number>>,
): BookingSpaceResolution {
  if (!spacesLabel) return { spaceIds: [], unresolvedLabels: [] };
  const names = spaceMap.get(facilityId);
  if (!names) return { spaceIds: [], unresolvedLabels: [spacesLabel] };

  const ids = resolveKnownSpaceLabelSequence(spacesLabel, names);
  if (ids) return { spaceIds: dedupeIds(ids), unresolvedLabels: [] };

  return {
    spaceIds: [],
    unresolvedLabels: unresolvedBookingSpaceLabels(spacesLabel, names),
  };
}

export function resolveBookingSpaceIds(
  facilityId: number,
  spacesLabel: string | null | undefined,
  spaceMap: Map<number, Map<string, number>>,
): number[] {
  return resolveBookingSpaces(facilityId, spacesLabel, spaceMap).spaceIds;
}

type BookingSpaceResolutionLog = {
  facilityId: number;
  spacesLabel?: string | null;
  spaceIds: number[];
  unresolvedLabels: string[];
};

function bookingSpaceResolutionLog(
  facilityId: number,
  spacesLabel: string | null | undefined,
  resolution: BookingSpaceResolution,
): BookingSpaceResolutionLog {
  return {
    facilityId,
    spacesLabel,
    spaceIds: resolution.spaceIds,
    unresolvedLabels: resolution.unresolvedLabels,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseJsonish(raw?: string | null): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (!raw || raw === "[]") return undefined;
  try { return toJson(JSON.parse(raw)); } catch { return toJson(raw); }
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function positiveIntEnv(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  return Math.min(value, max);
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

async function upsertRows<T>(label: string, rows: T[], limit: number, fn: (row: T) => Promise<void>): Promise<void> {
  if (rows.length === 0) {
    console.log(`no ${label} to write`);
    return;
  }

  const progressEvery = Number(process.env.DB_WRITE_PROGRESS_EVERY ?? 500);
  let completed = 0;
  console.log(`writing ${rows.length} ${label} to database`);
  await mapLimit(rows, limit, async (row) => {
    await fn(row);
    completed += 1;
    if (completed === rows.length || (progressEvery > 0 && completed % progressEvery === 0)) {
      console.log(`wrote ${completed}/${rows.length} ${label}`);
    }
  });
}

function omitId<T extends { id: number }>(row: T): Omit<T, "id"> {
  const rest: Partial<T> = { ...row };
  delete rest.id;
  return rest as Omit<T, "id">;
}

function defaultHistoricalBookingStartDate(today = new Date()): string {
  const currentYear = today.getFullYear();
  const currentSchoolYearStart = new Date(currentYear, 8, 1);
  const startYear = isBefore(today, currentSchoolYearStart) ? currentYear - 3 : currentYear - 2;
  return format(new Date(startYear, 8, 1), "yyyy-MM-dd");
}

function facilityRow(f: TdsbFacility, pictureFilenames: string[] = []) {
  return {
    id: f.id,
    name: decodeHtmlEntities(f.name),
    address: decodeHtmlEntities(f.address) ?? null,
    suite: decodeHtmlEntities(f.suite) ?? null,
    city: decodeHtmlEntities(f.city) ?? null,
    province: f.province ?? null,
    postalCode: f.postal_code ?? null,
    phone: f.phone ?? null,
    regionId: f.region_id ?? null,
    region: f.region ?? null,
    latitude: f.latitude ?? null,
    longitude: f.longitude ?? null,
    hoursJson: parseJsonish(f.hours) ?? Prisma.DbNull,
    pictureFilenames: pictureFilenames.length ? toJson(pictureFilenames) : Prisma.DbNull,
    rawJson: toJson(f),
    lastSyncedAt: new Date(),
  };
}

function spaceRow(s: TdsbSpace, details?: TdsbSpaceDetails) {
  return {
    id: Number(s.id),
    facilityId: Number(s.school_id),
    spaceTypeId: s.space_type_id ? Number(s.space_type_id) : null,
    name: decodeHtmlEntities(s.name),
    type: decodeHtmlEntities(s.type) ?? null,
    isAvailable: s.is_available === "1",
    isAvailableReg: s.is_available_reg === "1",
    hideFromPublic: s.hide_from_public === "1",
    areaSqm: details?.areaSqm ?? null,
    areaSqft: details?.areaSqft ?? null,
    hoursJson: parseJsonish(s.hours) ?? Prisma.DbNull,
    detailAttributes: details && Object.keys(details.attributes).length ? toJson(details.attributes) : Prisma.DbNull,
    pictureFilenames: details?.pictureFilenames.length ? toJson(details.pictureFilenames) : Prisma.DbNull,
    rawJson: toJson(s),
    lastSyncedAt: new Date(),
  };
}

type SpaceRow = ReturnType<typeof spaceRow>;

function jsonSql(value: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput): Prisma.Sql {
  return value === Prisma.DbNull ? Prisma.sql`NULL::jsonb` : Prisma.sql`${JSON.stringify(value)}::jsonb`;
}

async function upsertSpaceRows(rows: SpaceRow[]): Promise<void> {
  if (rows.length === 0) {
    console.log("no spaces to write");
    return;
  }

  const chunkSize = positiveIntEnv("DB_SPACE_UPSERT_CHUNK_SIZE", 1000, 3000);
  let completed = 0;
  console.log(`writing ${rows.length} spaces to database in chunks of ${chunkSize}`);

  for (const group of chunks(rows, chunkSize)) {
    const values = group.map((row) => Prisma.sql`(
      ${row.id},
      ${row.facilityId},
      ${row.spaceTypeId},
      ${row.name},
      ${row.type},
      ${row.isAvailable},
      ${row.isAvailableReg},
      ${row.hideFromPublic},
      ${row.areaSqm},
      ${row.areaSqft},
      ${jsonSql(row.hoursJson)},
      ${jsonSql(row.detailAttributes)},
      ${jsonSql(row.pictureFilenames)},
      ${jsonSql(row.rawJson)},
      ${row.lastSyncedAt}
    )`);

    await prisma.$executeRaw`
      INSERT INTO "Space" (
        "id",
        "facilityId",
        "spaceTypeId",
        "name",
        "type",
        "isAvailable",
        "isAvailableReg",
        "hideFromPublic",
        "areaSqm",
        "areaSqft",
        "hoursJson",
        "detailAttributes",
        "pictureFilenames",
        "rawJson",
        "lastSyncedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("id") DO UPDATE SET
        "facilityId" = EXCLUDED."facilityId",
        "spaceTypeId" = EXCLUDED."spaceTypeId",
        "name" = EXCLUDED."name",
        "type" = EXCLUDED."type",
        "isAvailable" = EXCLUDED."isAvailable",
        "isAvailableReg" = EXCLUDED."isAvailableReg",
        "hideFromPublic" = EXCLUDED."hideFromPublic",
        "areaSqm" = EXCLUDED."areaSqm",
        "areaSqft" = EXCLUDED."areaSqft",
        "hoursJson" = EXCLUDED."hoursJson",
        "detailAttributes" = EXCLUDED."detailAttributes",
        "pictureFilenames" = EXCLUDED."pictureFilenames",
        "rawJson" = EXCLUDED."rawJson",
        "lastSyncedAt" = EXCLUDED."lastSyncedAt"
    `;

    completed += group.length;
    console.log(`wrote ${completed}/${rows.length} spaces`);
  }
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

  const writeConcurrency = Number(process.env.DB_WRITE_CONCURRENCY ?? 8);
  const spaceTypeRows = [...typeMap.values()];
  const facilityRows = facilities.map((f) => facilityRow(f, picturesByFacilityId.get(f.id)));
  const spaceRows = spaces.map((space) => spaceRow(space, detailsBySpaceId.get(Number(space.id))));

  await upsertRows("space types", spaceTypeRows, writeConcurrency, async (row) => {
    await prisma.spaceType.upsert({
      where: { id: row.id },
      create: row,
      update: omitId(row),
    });
  });
  await upsertRows("facilities", facilityRows, writeConcurrency, async (row) => {
    await prisma.facility.upsert({
      where: { id: row.id },
      create: row,
      update: omitId(row),
    });
  });
  await upsertSpaceRows(spaceRows);

  const result = { spaceTypes: typeMap.size, facilities: facilities.length, spaces: spaces.length, spaceDetails: detailsBySpaceId.size };
  const completedAt = new Date();
  await prisma.syncStatus.upsert({
    where: { key: INVENTORY_SYNC_STATUS_KEY },
    create: {
      key: INVENTORY_SYNC_STATUS_KEY,
      lastSuccessfulSyncAt: completedAt,
      summaryJson: toJson(result),
    },
    update: {
      lastSuccessfulSyncAt: completedAt,
      summaryJson: toJson(result),
    },
  });

  return result;
}

async function facilitiesForBookingSync(facilityIds?: number[]) {
  const excludedFacilityIds = new Set(bookingSyncExcludedFacilityIds());
  const allFacilities = facilityIds?.length ? facilityIds.map((id) => ({ id })) : await prisma.facility.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  const facilities = allFacilities.filter((facility) => !excludedFacilityIds.has(facility.id));
  const skippedFacilities = allFacilities.length - facilities.length;
  if (skippedFacilities > 0) console.log(`skipping ${skippedFacilities} booking sync facilities: ${[...excludedFacilityIds].sort((a, b) => a - b).join(", ")}`);
  return { facilities, skippedFacilities };
}

async function spaceMapForFacilities(facilityIds: number[]) {
  const spaceRows = await prisma.space.findMany({
    where: { facilityId: { in: facilityIds } },
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
  return spaceMap;
}

function logBookingSpaceResolution(bookings: BookingSpaceResolutionLog[]) {
  const singleSpace = bookings.filter((b) => b.spaceIds.length === 1).length;
  const multiSpace = bookings.filter((b) => b.spaceIds.length > 1).length;
  const empty = bookings.length - singleSpace - multiSpace;
  console.log(`resolved spaceIds: ${singleSpace} single + ${multiSpace} multi-space = ${singleSpace + multiSpace}/${bookings.length} bookings (${empty} empty → facility-level fallback)`);

  const unresolved = bookings.filter((b) => b.unresolvedLabels.length > 0);
  if (unresolved.length === 0) return;

  const unresolvedParts = unresolved.reduce((sum, booking) => sum + booking.unresolvedLabels.length, 0);
  const examples = unresolved.slice(0, 5).map((booking) => (
    `${booking.facilityId} "${booking.spacesLabel ?? ""}" (${booking.unresolvedLabels.join(", ")})`
  )).join("; ");
  console.warn(`unresolved booking space labels for ${unresolved.length}/${bookings.length} bookings (${unresolvedParts} label parts); using facility-level fallback. Examples: ${examples}`);
}

export function bookingSyncSuccessfulFacilityIds(results: Array<{ facilityId: number; failed: boolean }>): number[] {
  return results.filter((result) => !result.failed).map((result) => result.facilityId);
}

export function bookingSyncReplacementWhere(facilityIds: number[], startDate: string, endDate: string): {
  booking: Prisma.BookingWhereInput;
  specialDate: Prisma.SpecialDateWhereInput;
} {
  const start = parseLocalDateTime(`${startDate} 00:00:00`);
  const end = parseLocalDateTime(`${endDate} 23:59:59`);
  return {
    booking: {
      facilityId: { in: facilityIds },
      startsAt: { lte: end },
      endsAt: { gte: start },
    },
    specialDate: {
      facilityId: { in: facilityIds },
      startsOn: { lte: end },
      endsOn: { gte: start },
    },
  };
}

function strictBookingSyncEnabled(): boolean {
  return process.env.STRICT_BOOKING_SYNC === "1";
}

function throwStrictBookingSyncFailure(failedFacilityIds: number[]): never {
  throw new Error(
    `Booking sync failed for ${failedFacilityIds.length} facilities; updated successful facilities and left failed facility caches untouched. Failed facility IDs: ${failedFacilityIds.join(", ")}`,
  );
}

export async function syncBookings(startDate?: string, endDate?: string, facilityIds?: number[]) {
  const client = new TdsbClient();
  const start = startDate ?? format(new Date(), "yyyy-MM-dd");
  const end = endDate ?? format(addDays(new Date(), Number(process.env.BOOKING_SYNC_DAYS ?? 180)), "yyyy-MM-dd");
  const concurrency = Number(process.env.SYNC_CONCURRENCY ?? 12);
  const { facilities, skippedFacilities } = await facilitiesForBookingSync(facilityIds);

  const results = await mapLimit(facilities, concurrency, async (facility, index) => {
    const result = { facilityId: facility.id, bookings: [] as Awaited<ReturnType<TdsbClient["bookings"]>>, specialDates: [] as Awaited<ReturnType<TdsbClient["specialDates"]>>, failed: false };
    try { result.bookings = await client.bookings(facility.id, `${start} 00:00:00`, `${end} 23:59:59`, 0); }
    catch (error) { result.failed = true; console.warn(`failed bookings for facility ${facility.id}:`, error instanceof Error ? error.message : error); }
    try { result.specialDates = await client.specialDates(facility.id, `${start} 00:00:00`, `${end} 23:59:59`); }
    catch (error) { result.failed = true; console.warn(`failed special dates for facility ${facility.id}:`, error instanceof Error ? error.message : error); }
    if ((index + 1) % 50 === 0) console.log(`fetched bookings/special dates for ${index + 1}/${facilities.length} facilities`);
    return result;
  });

  const failedFacilityIds = results.filter((r) => r.failed).map((r) => r.facilityId);
  const successfulFacilityIds = bookingSyncSuccessfulFacilityIds(results);
  const successfulResults = results.filter((r) => !r.failed);
  if (failedFacilityIds.length > 0) {
    console.warn(`booking sync had ${failedFacilityIds.length} failed facilities; leaving their existing cache untouched: ${failedFacilityIds.join(", ")}`);
  }

  const spaceMap = await spaceMapForFacilities(successfulFacilityIds);

  const bookingResolutionLogs: BookingSpaceResolutionLog[] = [];
  const bookings = successfulResults.flatMap((r) => r.bookings.map((b) => {
    const resolution = resolveBookingSpaces(r.facilityId, b.spaces, spaceMap);
    bookingResolutionLogs.push(bookingSpaceResolutionLog(r.facilityId, b.spaces, resolution));
    return {
      id: String(b.id),
      facilityId: r.facilityId,
      spaceIds: resolution.spaceIds,
      startsAt: parseLocalDateTime(b.start),
      endsAt: parseLocalDateTime(b.end),
      statusId: b.status_id == null ? null : Number(b.status_id),
      purpose: b.purpose,
      spacesLabel: b.spaces,
      rawJson: toJson(b),
      lastSyncedAt: new Date(),
    };
  }));
  logBookingSpaceResolution(bookingResolutionLogs);
  const specialDates = successfulResults.flatMap((r) => r.specialDates.map((s) => ({
    id: `${r.facilityId}:${s.id}`,
    facilityId: r.facilityId,
    startsOn: parseLocalDateTime(`${s.start} 00:00:00`),
    endsOn: parseLocalDateTime(`${s.end} 23:59:59`),
    reason: s.reason,
    rawJson: toJson(s),
    lastSyncedAt: new Date(),
  })));

  if (successfulFacilityIds.length > 0) {
    const replacementWhere = bookingSyncReplacementWhere(successfulFacilityIds, start, end);
    const writes = [
      prisma.booking.deleteMany({ where: replacementWhere.booking }),
      prisma.specialDate.deleteMany({ where: replacementWhere.specialDate }),
    ];
    for (const group of chunks(bookings, 1000)) writes.push(prisma.booking.createMany({ data: group, skipDuplicates: true }));
    for (const group of chunks(specialDates, 1000)) writes.push(prisma.specialDate.createMany({ data: group, skipDuplicates: true }));
    await prisma.$transaction(writes);
  }

  if (failedFacilityIds.length > 0 && strictBookingSyncEnabled()) {
    throwStrictBookingSyncFailure(failedFacilityIds);
  }

  return {
    facilities: facilities.length,
    skippedFacilities,
    refreshedFacilities: successfulFacilityIds.length,
    bookings: bookings.length,
    specialDates: specialDates.length,
    failures: failedFacilityIds.length,
    failedFacilityIds,
    startDate: start,
    endDate: end,
  };
}

export async function syncHistoricalBookings(startDate?: string, endDate?: string, facilityIds?: number[]) {
  const client = new TdsbClient();
  const start = startDate ?? defaultHistoricalBookingStartDate();
  const end = endDate ?? format(new Date(), "yyyy-MM-dd");
  const concurrency = Number(process.env.SYNC_CONCURRENCY ?? 12);
  const { facilities, skippedFacilities } = await facilitiesForBookingSync(facilityIds);

  const results = await mapLimit(facilities, concurrency, async (facility, index) => {
    const result = { facilityId: facility.id, bookings: [] as Awaited<ReturnType<TdsbClient["bookings"]>>, failed: false };
    try { result.bookings = await client.bookings(facility.id, `${start} 00:00:00`, `${end} 23:59:59`, 0); }
    catch (error) { result.failed = true; console.warn(`failed historical bookings for facility ${facility.id}:`, error instanceof Error ? error.message : error); }
    if ((index + 1) % 50 === 0) console.log(`fetched historical bookings for ${index + 1}/${facilities.length} facilities`);
    return result;
  });

  const spaceMap = await spaceMapForFacilities(facilities.map((f) => f.id));
  const bookingResolutionLogs: BookingSpaceResolutionLog[] = [];
  const bookings = results.flatMap((r) => r.bookings.map((b) => {
    const resolution = resolveBookingSpaces(r.facilityId, b.spaces, spaceMap);
    bookingResolutionLogs.push(bookingSpaceResolutionLog(r.facilityId, b.spaces, resolution));
    return {
      id: String(b.id),
      facilityId: r.facilityId,
      spaceIds: resolution.spaceIds,
      startsAt: parseLocalDateTime(b.start),
      endsAt: parseLocalDateTime(b.end),
      statusId: b.status_id == null ? null : Number(b.status_id),
      purpose: b.purpose,
      spacesLabel: b.spaces,
      rawJson: toJson(b),
      lastSyncedAt: new Date(),
    };
  }));
  logBookingSpaceResolution(bookingResolutionLogs);

  for (const group of chunks(bookings, 1000)) await prisma.booking.createMany({ data: group, skipDuplicates: true });

  return { facilities: facilities.length, skippedFacilities, bookings: bookings.length, failures: results.filter((r) => r.failed).length, startDate: start, endDate: end };
}
