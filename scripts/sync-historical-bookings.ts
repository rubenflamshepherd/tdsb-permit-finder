import { parseFacilityIdList, syncHistoricalBookings } from "../lib/sync";
import { prisma } from "../lib/prisma";

const start = process.env.START_DATE;
const end = process.env.END_DATE;
const facilityIds = parseFacilityIdList(process.env.FACILITY_IDS);
try {
  console.log(await syncHistoricalBookings(start, end, facilityIds.length ? facilityIds : undefined));
} finally {
  await prisma.$disconnect();
}
