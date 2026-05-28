import { NextResponse } from "next/server";
import type { SyncStatusResponse } from "@/lib/api-contracts";
import { prisma } from "@/lib/prisma";
import {
  BOOKINGS_SYNC_STATUS_KEY,
  INVENTORY_SYNC_STATUS_KEY,
  buildSyncStatusResponse,
} from "@/lib/sync-status";

export async function GET() {
  try {
    const rows = await prisma.syncStatus.findMany({
      where: { key: { in: [INVENTORY_SYNC_STATUS_KEY, BOOKINGS_SYNC_STATUS_KEY] } },
      select: { key: true, lastSuccessfulSyncAt: true },
    });
    return NextResponse.json(buildSyncStatusResponse(rows));
  } catch {
    return NextResponse.json({ inventory: null, bookings: null } satisfies SyncStatusResponse);
  }
}
