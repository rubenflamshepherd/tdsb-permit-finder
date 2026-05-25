"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { SyncStatusResponse } from "@/lib/api-contracts";
import { formatTdsbTimestamp } from "@/lib/time";

export function SiteFooter() {
  const [loadingPeriodCount, setLoadingPeriodCount] = useState(1);
  const { data: syncStatus = { inventory: null }, isFetching } = useQuery({
    queryKey: ["sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/sync-status");
      if (!res.ok) return { inventory: null } satisfies SyncStatusResponse;
      return (await res.json()) as SyncStatusResponse;
    },
  });
  const lastInventorySyncAt = syncStatus.inventory?.lastSuccessfulSyncAt;
  const isLoadingLastUpdated = isFetching && !lastInventorySyncAt;

  useEffect(() => {
    if (!isLoadingLastUpdated) return;

    const intervalId = window.setInterval(() => {
      setLoadingPeriodCount((count) => (count === 3 ? 1 : count + 1));
    }, 450);

    return () => window.clearInterval(intervalId);
  }, [isLoadingLastUpdated]);

  return (
    <footer className="site-footer">
      {lastInventorySyncAt ? (
        <p className="site-footer-updated">
          Last Updated <time dateTime={lastInventorySyncAt}>{formatTdsbTimestamp(lastInventorySyncAt)}</time>
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
