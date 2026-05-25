import { NextResponse } from "next/server";
import type { SyncStatusResponse } from "@/lib/api-contracts";
import { prisma } from "@/lib/prisma";
import { INVENTORY_SYNC_STATUS_KEY } from "@/lib/sync-status";

export async function GET() {
  try {
    const status = await prisma.syncStatus.findUnique({
      where: { key: INVENTORY_SYNC_STATUS_KEY },
      select: { lastSuccessfulSyncAt: true },
    });
    const body: SyncStatusResponse = {
      inventory: status ? { lastSuccessfulSyncAt: status.lastSuccessfulSyncAt.toISOString() } : null,
    };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ inventory: null } satisfies SyncStatusResponse);
  }
}
