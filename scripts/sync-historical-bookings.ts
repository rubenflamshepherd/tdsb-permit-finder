import { parseFacilityIdList, syncHistoricalBookings } from "../lib/sync";
import { disconnectPrisma } from "../lib/prisma";
import { openTdsbBrowserSession } from "../lib/tdsb-browser-session";
import { TdsbClient } from "../lib/tdsb-client";

const start = process.env.START_DATE;
const end = process.env.END_DATE;
const facilityIds = parseFacilityIdList(process.env.FACILITY_IDS);
const session = await openTdsbBrowserSession();
try {
  console.log(await syncHistoricalBookings(start, end, facilityIds.length ? facilityIds : undefined, new TdsbClient(undefined, session.fetch)));
} finally {
  await session.close();
  await disconnectPrisma();
}
