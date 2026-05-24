"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { NearbySearchResponse } from "@/lib/api-contracts";
import type { NearbyForm, SpaceType } from "@/app/components/nearby-search-types";

function upcomingSept15() {
  const now = new Date();
  const year = now.getMonth() < 8 ? now.getFullYear() : now.getFullYear() + 1;
  return `${year}-09-15`;
}

export function useNearbySearch() {
  const [spaceTypeId, setSpaceTypeId] = useState("17");
  const [nearbyForm, setNearbyForm] = useState<NearbyForm>({
    startDate: upcomingSept15(),
    startTime: "18:00",
    endTime: "22:00",
    weeks: 8,
    limit: 5,
    point: { lat: 43.6532, lng: -79.3832 },
  });
  const [lastNearbySearchKey, setLastNearbySearchKey] = useState<string | null>(null);

  const { data: spaceTypes = [] } = useQuery({
    queryKey: ["space-types"],
    queryFn: async () => (await fetch("/api/space-types")).json() as Promise<SpaceType[]>,
  });

  const nearbySearchKey = useMemo(() => JSON.stringify({
    lat: nearbyForm.point.lat,
    lng: nearbyForm.point.lng,
    startDate: nearbyForm.startDate,
    startTime: nearbyForm.startTime,
    endTime: nearbyForm.endTime,
    weeks: nearbyForm.weeks,
    limit: nearbyForm.limit,
    spaceTypeId,
  }), [
    nearbyForm.endTime,
    nearbyForm.limit,
    nearbyForm.point.lat,
    nearbyForm.point.lng,
    nearbyForm.startDate,
    nearbyForm.startTime,
    nearbyForm.weeks,
    spaceTypeId,
  ]);

  const nearby = useMutation<NearbySearchResponse, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/nearby", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: nearbyForm.point.lat,
          lng: nearbyForm.point.lng,
          startDate: nearbyForm.startDate,
          startTime: nearbyForm.startTime,
          endTime: nearbyForm.endTime,
          weeks: Number(nearbyForm.weeks),
          limit: Number(nearbyForm.limit),
          spaceTypeId: spaceTypeId ? Number(spaceTypeId) : undefined,
        }),
      });
      if (!res.ok) throw new Error("Nearby search failed. Make sure the database has synced facility coordinates and bookings.");
      return (await res.json()) as NearbySearchResponse;
    },
  });

  const hasCurrentNearbyResults = Boolean(nearby.data && lastNearbySearchKey === nearbySearchKey);

  function startNearbySearch() {
    setLastNearbySearchKey(nearbySearchKey);
    nearby.mutate();
  }

  function resetNearbySearch() {
    setLastNearbySearchKey(null);
    nearby.reset();
  }

  return {
    nearbyForm,
    setNearbyForm,
    spaceTypeId,
    setSpaceTypeId,
    spaceTypes,
    nearby,
    hasCurrentNearbyResults,
    startNearbySearch,
    resetNearbySearch,
  };
}
