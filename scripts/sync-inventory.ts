import { syncInventory } from "../lib/sync";
import { disconnectPrisma } from "../lib/prisma";
import { openTdsbBrowserSession } from "../lib/tdsb-browser-session";
import { TdsbClient } from "../lib/tdsb-client";

const permitTypeId = Number(process.env.PERMIT_TYPE_ID ?? 3);
const session = await openTdsbBrowserSession();
try {
  console.log(await syncInventory(permitTypeId, new TdsbClient(undefined, session.fetch)));
} finally {
  await session.close();
  await disconnectPrisma();
}
