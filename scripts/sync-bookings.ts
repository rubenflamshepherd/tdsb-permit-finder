import { syncBookings } from "../lib/sync";
import { disconnectPrisma } from "../lib/prisma";
import { openTdsbBrowserSession } from "../lib/tdsb-browser-session";
import { TdsbClient } from "../lib/tdsb-client";

const start = process.env.START_DATE;
const end = process.env.END_DATE;
const session = await openTdsbBrowserSession();
try {
  console.log(await syncBookings(start, end, undefined, new TdsbClient(undefined, session.fetch)));
} finally {
  await session.close();
  await disconnectPrisma();
}
