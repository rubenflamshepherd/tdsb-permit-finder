import type { SyncStatusResponse } from "./api-contracts";

export const INVENTORY_SYNC_STATUS_KEY = "inventory";
export const BOOKINGS_SYNC_STATUS_KEY = "bookings";

export type SyncStatusRow = {
  key: string;
  lastSuccessfulSyncAt: Date;
};

export function buildSyncStatusResponse(rows: SyncStatusRow[]): SyncStatusResponse {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const entry = (key: string) => {
    const row = byKey.get(key);
    return row ? { lastSuccessfulSyncAt: row.lastSuccessfulSyncAt.toISOString() } : null;
  };
  return {
    inventory: entry(INVENTORY_SYNC_STATUS_KEY),
    bookings: entry(BOOKINGS_SYNC_STATUS_KEY),
  };
}
