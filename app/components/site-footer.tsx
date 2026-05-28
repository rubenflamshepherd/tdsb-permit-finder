"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { SyncStatusResponse } from "@/lib/api-contracts";
import { formatTdsbTimestamp } from "@/lib/time";

export function SiteFooter() {
  const [loadingPeriodCount, setLoadingPeriodCount] = useState(1);
  const { data: syncStatus = { inventory: null, bookings: null }, isFetching } = useQuery({
    queryKey: ["sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/sync-status");
      if (!res.ok) return { inventory: null, bookings: null } satisfies SyncStatusResponse;
      return (await res.json()) as SyncStatusResponse;
    },
  });
  const lastUpdatedAt =
    syncStatus.bookings?.lastSuccessfulSyncAt ?? syncStatus.inventory?.lastSuccessfulSyncAt;
  const isLoadingLastUpdated = isFetching && !lastUpdatedAt;

  useEffect(() => {
    if (!isLoadingLastUpdated) return;

    const intervalId = window.setInterval(() => {
      setLoadingPeriodCount((count) => (count === 3 ? 1 : count + 1));
    }, 450);

    return () => window.clearInterval(intervalId);
  }, [isLoadingLastUpdated]);

  return (
    <footer className="site-footer">
      {lastUpdatedAt ? (
        <p className="site-footer-updated">
          Last Updated <time dateTime={lastUpdatedAt}>{formatTdsbTimestamp(lastUpdatedAt)}</time>
        </p>
      ) : isLoadingLastUpdated ? (
        <p className="site-footer-updated" aria-label="Last update: Loading">
          Last update: Loading<span aria-hidden="true">{".".repeat(loadingPeriodCount)}</span>
        </p>
      ) : null}
      <p>
        Made by{" "}
        <a href="https://rubenflamshepherd.com" target="_blank" rel="noopener noreferrer">
          Ruben
        </a>
      </p>
    </footer>
  );
}
