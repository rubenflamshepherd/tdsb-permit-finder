"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryModal, CATEGORY_STORAGE_KEY, FEE_CATEGORIES, FeeBadge, SCHEDULE_ORIENT_STORAGE_KEY, SettingsButton, type EffectiveScheduleOrient, type ScheduleOrient } from "@/app/components/fee-ui";
import { PhotoGalleryModal, type GallerySpace } from "@/app/components/photo-gallery-modal";
import type { AvailabilitySearchResponse, NearbySchool, NearbySearchResponse } from "@/lib/api-contracts";
import { pickTimeOfUse, type FeeCategory } from "@/lib/fees";

type SpaceType = { id: number | string; name: string };

const weekdays = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"],
] as const;

type AvailabilityStatus = "available" | "partial" | "unavailable";

const statusLabel: Record<AvailabilityStatus, string> = {
  available: "All weeks",
  partial: "Some weeks",
  unavailable: "No weeks",
};

const slotStatusLabel: Record<"available" | "rare" | "frequent" | "unavailable", string> = {
  available: "Free every week",
  rare: "Booked one week",
  frequent: "Booked some weeks",
  unavailable: "Booked every week",
};

function getSchoolStatus(school: NearbySchool): AvailabilityStatus {
  const availableWeeks = school.schedule.reduce((sum, slot) => sum + slot.availableWeeks, 0);
  const totalWeeks = school.schedule.reduce((sum, slot) => sum + slot.totalWeeks, 0);
  if (availableWeeks === 0) return "unavailable";
  if (availableWeeks === totalWeeks) return "available";
  return "partial";
}

function getSchoolSummary(school: NearbySchool) {
  const availableDays = school.schedule.filter((slot) => slot.availableWeeks > 0).length;
  const totalDays = school.schedule.length;
  const openWeeks = school.schedule.reduce((sum, slot) => sum + slot.availableWeeks, 0);
  const totalWeeks = school.schedule.reduce((sum, slot) => sum + slot.totalWeeks, 0);
  return { availableDays, totalDays, openWeeks, totalWeeks };
}

function makeSelectedMarkerElement() {
  const marker = document.createElement("div");
  marker.className = "selected-location-marker";
  marker.setAttribute("role", "img");
  marker.setAttribute("aria-label", "Selected search point");

  const pulse = document.createElement("span");
  pulse.className = "selected-location-pulse";
  const core = document.createElement("span");
  core.className = "selected-location-core";
  marker.append(pulse, core);
  return marker;
}

function makeRadiusFeature(center: { lat: number; lng: number }, radiusKm: number) {
  const steps = 96;
  const coordinates = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    const latOffset = (radiusKm / 110.574) * Math.sin(angle);
    const lngOffset = (radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))) * Math.cos(angle);
    return [center.lng + lngOffset, center.lat + latOffset];
  });

  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
  };
}

function setNearbyRadius(map: MapLibreMap, center: { lat: number; lng: number }, radiusKm: number) {
  const data = makeRadiusFeature(center, Math.max(radiusKm, 0.25));
  const source = map.getSource("nearby-radius") as GeoJSONSource | undefined;

  if (source) {
    source.setData(data);
    return;
  }

  map.addSource("nearby-radius", { type: "geojson", data });
  map.addLayer({
    id: "nearby-radius-fill",
    type: "fill",
    source: "nearby-radius",
    paint: { "fill-color": "#185c37", "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "nearby-radius-line",
    type: "line",
    source: "nearby-radius",
    paint: { "line-color": "#185c37", "line-opacity": 0.34, "line-width": 2, "line-dasharray": [2, 2] },
  });
}

function clearNearbyRadius(map: MapLibreMap) {
  if (map.getLayer("nearby-radius-line")) map.removeLayer("nearby-radius-line");
  if (map.getLayer("nearby-radius-fill")) map.removeLayer("nearby-radius-fill");
  if (map.getSource("nearby-radius")) map.removeSource("nearby-radius");
}

type ConnectorEndpoint = { lat: number; lng: number };

function setNearbyConnectors(map: MapLibreMap, origin: ConnectorEndpoint, schools: ConnectorEndpoint[]) {
  const data = {
    type: "FeatureCollection" as const,
    features: schools.map((school) => ({
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: [[origin.lng, origin.lat], [school.lng, school.lat]],
      },
    })),
  };
  const source = map.getSource("nearby-connectors") as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource("nearby-connectors", { type: "geojson", data });
  map.addLayer({
    id: "nearby-connectors-line",
    type: "line",
    source: "nearby-connectors",
    paint: { "line-color": "#185c37", "line-opacity": 0.32, "line-width": 1.5, "line-dasharray": [3, 3] },
  }, map.getLayer("nearby-radius-line") ? "nearby-radius-line" : undefined);
}

function clearNearbyConnectors(map: MapLibreMap) {
  if (map.getLayer("nearby-connectors-line")) map.removeLayer("nearby-connectors-line");
  if (map.getSource("nearby-connectors")) map.removeSource("nearby-connectors");
}

export default function Home() {
  const today = new Date().toISOString().slice(0, 10);
  const upcomingSept1 = (() => {
    const now = new Date();
    const year = now.getMonth() < 8 ? now.getFullYear() : now.getFullYear() + 1;
    return `${year}-09-01`;
  })();
  const [activeTab, setActiveTab] = useState<"search" | "nearby">("nearby");
  const [form, setForm] = useState({
    startDate: today,
    endDate: today,
    startTime: "18:00",
    endTime: "20:00",
    weekdays: [1, 2, 3, 4, 5],
    spaceTypeId: "18",
    matchMode: "partial" as "all" | "partial",
  });
  const [nearbyForm, setNearbyForm] = useState({
    startDate: upcomingSept1,
    startTime: "18:00",
    endTime: "20:00",
    weeks: 8,
    limit: 5,
    point: { lat: 43.6532, lng: -79.3832 },
  });
  const [spaceTypeOpen, setSpaceTypeOpen] = useState(false);
  const [spaceTypeQuery, setSpaceTypeQuery] = useState("");
  const [lastNearbySearchKey, setLastNearbySearchKey] = useState<string | null>(null);
  const [gallerySpace, setGallerySpace] = useState<GallerySpace | null>(null);
  const [feeCategory, setFeeCategory] = useState<FeeCategory>("B");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scheduleOrient, setScheduleOrient] = useState<ScheduleOrient>("auto");
  const [autoEffectiveOrient, setAutoEffectiveOrient] = useState<EffectiveScheduleOrient>("times");

  useEffect(() => {
    window.setTimeout(() => {
      const stored = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
      if (stored && (FEE_CATEGORIES as string[]).includes(stored)) {
        setFeeCategory(stored as FeeCategory);
      } else {
        setCategoryModalOpen(true);
      }
      const storedOrient = window.localStorage.getItem(SCHEDULE_ORIENT_STORAGE_KEY);
      if (storedOrient === "days" || storedOrient === "times") setScheduleOrient(storedOrient);
    }, 0);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setAutoEffectiveOrient(mq.matches ? "days" : "times");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("schedule-orient-days", scheduleOrient === "days");
    document.body.classList.toggle("schedule-orient-times", scheduleOrient === "times");
  }, [scheduleOrient]);

  const effectiveScheduleOrient: EffectiveScheduleOrient = scheduleOrient === "auto" ? autoEffectiveOrient : scheduleOrient;

  function selectFeeCategory(next: FeeCategory) {
    setFeeCategory(next);
    window.localStorage.setItem(CATEGORY_STORAGE_KEY, next);
    setCategoryModalOpen(false);
  }

  function selectScheduleOrient(next: EffectiveScheduleOrient) {
    setScheduleOrient(next);
    window.localStorage.setItem(SCHEDULE_ORIENT_STORAGE_KEY, next);
  }

  useEffect(() => {
    if (!categoryModalOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setCategoryModalOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [categoryModalOpen]);

  const spaceTypeInputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const schoolMarkersRef = useRef<Marker[]>([]);
  const schoolMarkerByIdRef = useRef<Map<number, Marker>>(new Map());
  const hasResultsRef = useRef(false);

  const { data: spaceTypes = [] } = useQuery({
    queryKey: ["space-types"],
    queryFn: async () => (await fetch("/api/space-types")).json() as Promise<SpaceType[]>,
  });

  const selectedSpaceType = spaceTypes.find((type) => String(type.id) === form.spaceTypeId);
  const filteredSpaceTypes = useMemo(() => {
    const query = spaceTypeQuery.trim().toLowerCase();
    if (!query) return spaceTypes;
    return spaceTypes.filter((type) => type.name.toLowerCase().includes(query));
  }, [spaceTypeQuery, spaceTypes]);
  const nearbySearchKey = JSON.stringify({
    lat: nearbyForm.point.lat,
    lng: nearbyForm.point.lng,
    startDate: nearbyForm.startDate,
    startTime: nearbyForm.startTime,
    endTime: nearbyForm.endTime,
    weeks: nearbyForm.weeks,
    limit: nearbyForm.limit,
    spaceTypeId: form.spaceTypeId,
  });

  useEffect(() => {
    if (activeTab !== "nearby" || !mapContainerRef.current || mapRef.current) return;
    let disposed = false;
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (disposed || !mapContainerRef.current) return;
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        center: [nearbyForm.point.lng, nearbyForm.point.lat],
        zoom: 12,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            carto: {
              type: "raster",
              tiles: [
                "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
                "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
                "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
                "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution: "OpenStreetMap contributors, CARTO",
            },
          },
          layers: [{ id: "carto", type: "raster", source: "carto" }],
        },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.once("load", () => {
        mapContainerRef.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      });
      const marker = new maplibregl.Marker({ element: makeSelectedMarkerElement(), anchor: "center" })
        .setLngLat([nearbyForm.point.lng, nearbyForm.point.lat])
        .addTo(map);
      map.on("click", (event) => {
        if (hasResultsRef.current) return;
        const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
        marker.setLngLat([point.lng, point.lat]);
        setNearbyForm((current) => ({ ...current, point }));
      });
      mapRef.current = map;
      markerRef.current = marker;
    });
    return () => { disposed = true; };
  }, [activeTab, nearbyForm.point.lat, nearbyForm.point.lng]);

  useEffect(() => {
    if (activeTab === "nearby") requestAnimationFrame(() => mapRef.current?.resize());
  }, [activeTab]);

  useEffect(() => {
    markerRef.current?.setLngLat([nearbyForm.point.lng, nearbyForm.point.lat]);
  }, [nearbyForm.point.lat, nearbyForm.point.lng]);

  const search = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: form.startDate,
          endDate: form.endDate,
          startTime: form.startTime,
          endTime: form.endTime,
          weekdays: form.weekdays,
          spaceTypeIds: form.spaceTypeId ? [Number(form.spaceTypeId)] : undefined,
          matchMode: form.matchMode,
        }),
      });
      if (!res.ok) throw new Error("Search failed. Make sure the database has been synced.");
      return (await res.json()) as Promise<AvailabilitySearchResponse>;
    },
  });

  const nearby = useMutation({
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
          spaceTypeId: form.spaceTypeId ? Number(form.spaceTypeId) : undefined,
        }),
      });
      if (!res.ok) throw new Error("Nearby search failed. Make sure the database has synced facility coordinates and bookings.");
      return (await res.json()) as Promise<NearbySearchResponse>;
    },
  });
  const hasCurrentNearbyResults = Boolean(nearby.data && lastNearbySearchKey === nearbySearchKey);
  useEffect(() => { hasResultsRef.current = hasCurrentNearbyResults; }, [hasCurrentNearbyResults]);

  function resetNearbySearch() {
    setLastNearbySearchKey(null);
    nearby.reset();
  }

  useEffect(() => {
    const schools = hasCurrentNearbyResults ? nearby.data?.schools ?? [] : [];
    schoolMarkersRef.current.forEach((marker) => marker.remove());
    schoolMarkersRef.current = [];
    schoolMarkerByIdRef.current.clear();
    if (!mapRef.current) return;

    if (!hasCurrentNearbyResults) {
      clearNearbyRadius(mapRef.current);
      clearNearbyConnectors(mapRef.current);
      return;
    }

    if (schools.length === 0) {
      clearNearbyConnectors(mapRef.current);
      const applyRadius = () => setNearbyRadius(mapRef.current!, { lat: nearbyForm.point.lat, lng: nearbyForm.point.lng }, 0.8);
      if (mapRef.current.isStyleLoaded()) applyRadius();
      else mapRef.current.once("load", applyRadius);
      return;
    }

    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!mapRef.current) return;
      const map = mapRef.current;
      const bounds = new maplibregl.LngLatBounds(
        [nearbyForm.point.lng, nearbyForm.point.lat],
        [nearbyForm.point.lng, nearbyForm.point.lat],
      );
      let visibleSchoolCount = 0;
      let farthestSchoolKm = 0;
      const connectorTargets: ConnectorEndpoint[] = [];

      for (const [index, school] of schools.entries()) {
        const lat = school.facility.latitude;
        const lng = school.facility.longitude;
        if (lat == null || lng == null) continue;
        connectorTargets.push({ lat, lng });

        const status = getSchoolStatus(school);
        const summary = getSchoolSummary(school);
        const markerElement = document.createElement("button");
        markerElement.type = "button";
        markerElement.className = `school-marker ${status}`;
        markerElement.textContent = String(index + 1);
        markerElement.setAttribute("aria-label", `${index + 1}. ${school.facility.name}, ${statusLabel[status]}`);
        const popupElement = document.createElement("div");
        popupElement.className = "school-popup";
        const popupThumbUrl = school.facility.pictureUrls?.[0];
        if (popupThumbUrl) {
          const thumb = document.createElement("img");
          thumb.className = "school-popup-thumb";
          thumb.src = popupThumbUrl;
          thumb.alt = `${school.facility.name} exterior`;
          thumb.loading = "lazy";
          popupElement.append(thumb);
        }
        const title = document.createElement("strong");
        title.textContent = school.facility.name;
        const details = document.createElement("span");
        details.textContent = `${school.distanceKm.toFixed(1)} km away`;
        const availability = document.createElement("span");
        availability.textContent = `${summary.availableDays}/${summary.totalDays} days have openings`;
        const statusPill = document.createElement("em");
        statusPill.className = `school-popup-status ${status}`;
        statusPill.textContent = `${statusLabel[status]} · ${summary.openWeeks}/${summary.totalWeeks} slots`;
        popupElement.append(title, details, availability, statusPill);

        const marker = new maplibregl.Marker({ element: markerElement, anchor: "center" })
          .setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup({ offset: 18 }).setDOMContent(popupElement))
          .addTo(map);
        markerElement.addEventListener("click", (event) => {
          event.stopImmediatePropagation();
          map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13.5), duration: 500 });
          marker.togglePopup();
        }, { capture: true });
        schoolMarkersRef.current.push(marker);
        schoolMarkerByIdRef.current.set(school.facility.id, marker);
        bounds.extend([lng, lat]);
        farthestSchoolKm = Math.max(farthestSchoolKm, school.distanceKm);
        visibleSchoolCount += 1;
      }

      if (visibleSchoolCount > 0) {
        const origin = { lat: nearbyForm.point.lat, lng: nearbyForm.point.lng };
        const applyOverlays = () => {
          setNearbyRadius(map, origin, farthestSchoolKm + 0.35);
          setNearbyConnectors(map, origin, connectorTargets);
        };
        if (map.isStyleLoaded()) applyOverlays();
        else map.once("load", applyOverlays);
        map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 600 });
      } else {
        clearNearbyConnectors(map);
      }
    });
  }, [hasCurrentNearbyResults, nearby.data, nearbyForm.point.lat, nearbyForm.point.lng]);

  function focusSchoolOnMap(school: NearbySchool) {
    const lat = school.facility.latitude;
    const lng = school.facility.longitude;
    if (!mapRef.current || lat == null || lng == null) return;
    mapRef.current.easeTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 13.5), duration: 500 });
    schoolMarkerByIdRef.current.get(school.facility.id)?.togglePopup();
  }

  const grouped = useMemo(() => {
    const rows = search.data?.results ?? [];
    return rows.reduce<Record<string, AvailabilitySearchResponse["results"][number][]>>((acc, row) => {
      acc[row.facility.name] ??= [];
      acc[row.facility.name].push(row);
      return acc;
    }, {});
  }, [search.data]);

  function toggleWeekday(day: number) {
    setForm((f) => ({ ...f, weekdays: f.weekdays.includes(day) ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day].sort() }));
  }

  function selectSpaceType(id: string) {
    setForm((f) => ({ ...f, spaceTypeId: id }));
    setSpaceTypeQuery("");
    setSpaceTypeOpen(false);
  }

  const spaceTypePicker = (
    <div className="field field-wide">
      <span className="field-label">Space type</span>
      <div className="combo" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSpaceTypeOpen(false);
      }}>
        <button
          type="button"
          className="combo-trigger"
          aria-haspopup="listbox"
          aria-expanded={spaceTypeOpen}
          onClick={() => {
            setSpaceTypeOpen((open) => !open);
            requestAnimationFrame(() => spaceTypeInputRef.current?.focus());
          }}
        >
          <span>{selectedSpaceType?.name ?? "Any public type"}</span>
          <span className="chevron">⌄</span>
        </button>
        {spaceTypeOpen ? (
          <div className="combo-panel">
            <input
              ref={spaceTypeInputRef}
              className="combo-search"
              value={spaceTypeQuery}
              onChange={(e) => setSpaceTypeQuery(e.target.value)}
              placeholder="Search gyms, classrooms, auditoriums..."
            />
            <div className="combo-list" role="listbox">
              <button type="button" className={!form.spaceTypeId ? "combo-option active" : "combo-option"} onMouseDown={(e) => e.preventDefault()} onClick={() => selectSpaceType("")}>Any public type</button>
              {filteredSpaceTypes.map((type) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={String(type.id) === form.spaceTypeId}
                  key={String(type.id)}
                  className={String(type.id) === form.spaceTypeId ? "combo-option active" : "combo-option"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSpaceType(String(type.id))}
                >
                  {type.name}
                </button>
              ))}
              {filteredSpaceTypes.length === 0 ? <div className="combo-empty">No room types match &quot;{spaceTypeQuery}&quot;.</div> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <main className="container">
      <SettingsButton feeCategory={feeCategory} onClick={() => setCategoryModalOpen(true)} />

      <section className="hero">
        <div className="eyebrow">
          <svg className="eyebrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1z" />
            <path d="M18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2" />
            <path d="M18 22v-3" />
            <circle cx="10" cy="10" r="3" />
          </svg>
          <span>TDSB permit finder</span>
        </div>
        <h1>Find school spaces that fit your schedule.</h1>
        <p>Search cached TDSB facility, room, booking, and closure data to identify spaces that appear available for a recurring time window.</p>
      </section>

      <nav className="tabs" aria-label="Search mode">
        <button type="button" className={activeTab === "nearby" ? "active" : ""} onClick={() => setActiveTab("nearby")}>Map nearby</button>
        <button type="button" className={activeTab === "search" ? "active" : ""} onClick={() => setActiveTab("search")}>Schedule search</button>
      </nav>

      {activeTab === "search" ? (
        <>
          <section className="card search">
            <div className="search-header">
              <div>
                <h2>Search filters</h2>
                <p>Choose the room type, dates, and recurring time window you care about.</p>
              </div>
              <button className="secondary" onClick={() => search.mutate()} disabled={search.isPending}>{search.isPending ? "Searching..." : "Search spaces"}</button>
            </div>

            <div className="grid">
              {spaceTypePicker}
              <label>Start date<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
              <label>End date<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>

              <div className="field field-wide">
                <span className="field-label">Availability</span>
                <div className="segment" role="radiogroup" aria-label="Availability match mode">
                  <button type="button" className={form.matchMode === "partial" ? "active" : ""} onClick={() => setForm({ ...form, matchMode: "partial" })}>Partial matches</button>
                  <button type="button" className={form.matchMode === "all" ? "active" : ""} onClick={() => setForm({ ...form, matchMode: "all" })}>Every selected date</button>
                </div>
              </div>

              <label>Start time<input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
              <label>End time<input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
              <div className="field field-wide">
                <span className="field-label">Weekdays</span>
                <div className="checks" aria-label="Weekdays">
                  {weekdays.map(([day, label]) => <label key={day}><input type="checkbox" checked={form.weekdays.includes(day)} onChange={() => toggleWeekday(day)} />{label}</label>)}
                </div>
              </div>
            </div>
          </section>

          <section className="results">
            {search.error ? <div className="card empty">{search.error.message}</div> : null}
            {search.data && search.data.results.length === 0 ? <div className="card empty">No matching spaces found. Try partial matches or a broader date range.</div> : null}
            {Object.entries(grouped).map(([facility, rows]) => (
              <article className="card result" key={facility}>
                <div>
                  <h3>{facility}</h3>
                  <div className="meta">{rows[0].facility.address} {rows[0].facility.city} {rows[0].facility.postalCode}</div>
                  {rows.map((row) => (
                    <p key={`${row.facility.name}-${row.space.name}`}>
                      <strong>{row.space.name}</strong>{" "}
                      <span className="meta">{row.space.type}</span>{" "}
                      <FeeBadge spaceTypeId={row.space.spaceTypeId} category={feeCategory} timeOfUse={pickTimeOfUse(form.weekdays)} />
                    </p>
                  ))}
                </div>
                <div className="availability-stat">
                  <span className="stat-number">{rows.reduce((sum, row) => sum + row.availableOccurrences, 0)}</span>
                  <span className="stat-label">open<br />occurrences</span>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="card search map-search">
            <div className="search-header">
              <div>
                <h2>Map nearby</h2>
                <p>Click the map, then find the five closest schools with this room type and weekly availability pattern.</p>
              </div>
              <div className="search-header-actions">
                {hasCurrentNearbyResults ? (
                  <button type="button" className="secondary" onClick={resetNearbySearch}>New search</button>
                ) : (
                  <button className="secondary" onClick={() => {
                    setLastNearbySearchKey(nearbySearchKey);
                    nearby.mutate();
                  }} disabled={nearby.isPending}>{nearby.isPending ? "Checking..." : "Find closest schools"}</button>
                )}
              </div>
            </div>
            <div className="map-layout">
              <div className="map-panel">
                <div ref={mapContainerRef} className="map-canvas" />
                <div className="map-overlay map-overlay-tl">
                  <div className="selected-point floating">
                    <strong>{nearbyForm.point.lat.toFixed(5)}, {nearbyForm.point.lng.toFixed(5)}</strong>
                    <span>Selected point</span>
                  </div>
                </div>
                {hasCurrentNearbyResults && (nearby.data?.schools.length ?? 0) > 0 ? (
                  <div className="map-overlay map-overlay-bl">
                    <div className="legend floating" aria-label="Availability legend">
                      <span><i className="dot available" />All weeks</span>
                      <span><i className="dot partial" />Some weeks</span>
                      <span><i className="dot unavailable" />No weeks</span>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={`map-controls${filtersOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="map-controls-handle"
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                  aria-controls="map-controls-fields"
                >
                  <span className="map-controls-handle-grab" aria-hidden />
                  <span className="map-controls-handle-label">Filters</span>
                  <span className="map-controls-handle-chevron" aria-hidden>{filtersOpen ? "▾" : "▴"}</span>
                </button>
                <div id="map-controls-fields" className="grid compact-grid map-controls-fields">
                  {spaceTypePicker}
                  <label>From week of<input type="date" value={nearbyForm.startDate} onChange={(e) => setNearbyForm({ ...nearbyForm, startDate: e.target.value })} /></label>
                  <label>Look N weeks ahead<input type="number" min="1" max="26" value={nearbyForm.weeks} onChange={(e) => setNearbyForm({ ...nearbyForm, weeks: Number(e.target.value) })} /></label>
                  <label>Closest N schools<input type="number" min="1" max="20" value={nearbyForm.limit} onChange={(e) => setNearbyForm({ ...nearbyForm, limit: Number(e.target.value) })} /></label>
                  <label>Start time<input type="time" value={nearbyForm.startTime} onChange={(e) => setNearbyForm({ ...nearbyForm, startTime: e.target.value })} /></label>
                  <label>End time<input type="time" value={nearbyForm.endTime} onChange={(e) => setNearbyForm({ ...nearbyForm, endTime: e.target.value })} /></label>
                </div>
              </div>
            </div>
          </section>

          <section className="results">
            {nearby.error ? <div className="card empty">{nearby.error.message}</div> : null}
            {hasCurrentNearbyResults && nearby.data?.schools.length === 0 ? <div className="card empty">No schools with that public room type and coordinates were found.</div> : null}
            {hasCurrentNearbyResults ? nearby.data?.schools.map((school) => (
              <article className="card nearby-result" key={school.facility.id} onMouseEnter={() => {
                schoolMarkerByIdRef.current.get(school.facility.id)?.getElement().classList.add("is-highlighted");
              }} onMouseLeave={() => {
                schoolMarkerByIdRef.current.get(school.facility.id)?.getElement().classList.remove("is-highlighted");
              }}>
                <div className="nearby-heading">
                  <div className="nearby-heading-text">
                    <h3>{school.facility.name}</h3>
                    <div className="meta">{school.facility.address} {school.facility.city} {school.facility.postalCode}</div>
                    <ul className="space-list" aria-label="Spaces">
                      {school.spaces.slice(0, 4).map((space) => (
                        <li className="space-chip" key={space.id}>
                          <span className="space-chip-name">{space.name}</span>
                          <FeeBadge spaceTypeId={space.spaceTypeId} category={feeCategory} />
                          <button
                            type="button"
                            className="photos-icon-btn space-chip-photos"
                            onClick={() => setGallerySpace({ schoolName: school.facility.name, space: { id: space.id, name: space.name } })}
                            aria-label={`View photos of ${space.name}`}
                            title="View photos"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </button>
                        </li>
                      ))}
                      {school.spaces.length > 4 ? (
                        <li className="space-chip space-chip-more">+{school.spaces.length - 4} more</li>
                      ) : null}
                    </ul>
                  </div>
                  <button type="button" className={`distance-pill ${getSchoolStatus(school)}`} onClick={() => focusSchoolOnMap(school)}>{school.distanceKm.toFixed(1)} km</button>
                </div>
                {(() => {
                  const slotTemplate = school.schedule[0]?.slots ?? [];
                  if (slotTemplate.length === 0) return <div className="schedule-grid empty">No time slots in the requested window.</div>;
                  return (
                    <div className="schedule-grid" role="grid" aria-label={`${school.facility.name} weekly schedule`}>
                      <div className="schedule-header" role="row">
                        <span className="schedule-corner" aria-hidden />
                        {school.schedule.map((day, dayIdx) => (
                          <span key={day.day} className="schedule-day-label" role="columnheader" style={{ "--day-idx": dayIdx } as React.CSSProperties}>{day.label}</span>
                        ))}
                      </div>
                      {slotTemplate.map((templateSlot, idx) => (
                        <div className="schedule-row" key={templateSlot.start} role="row">
                          <span className="schedule-time-label" role="rowheader" style={{ "--slot-idx": idx } as React.CSSProperties}>{templateSlot.start}</span>
                          {school.schedule.map((day, dayIdx) => {
                            const slot = day.slots[idx];
                            return (
                              <Tooltip.Root key={day.day}>
                                <Tooltip.Trigger asChild>
                                  <span
                                    role="gridcell"
                                    tabIndex={0}
                                    className={`slot-cell ${slot.status}`}
                                    style={{ "--day-idx": dayIdx, "--slot-idx": idx } as React.CSSProperties}
                                    aria-label={`${day.label} ${slot.start} to ${slot.end}: ${slot.availableWeeks} of ${slot.totalWeeks} weeks free`}
                                  />
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content className="slot-tooltip" side="top" sideOffset={6}>
                                    <div className="slot-tooltip-row">
                                      <strong>{day.label} · {slot.start}–{slot.end}</strong>
                                    </div>
                                    <div className={`slot-tooltip-row slot-tooltip-status ${slot.status}`}>
                                      {slotStatusLabel[slot.status]}
                                    </div>
                                    <div className="slot-tooltip-row slot-tooltip-meta">
                                      {slot.availableWeeks} of {slot.totalWeeks} weeks free
                                    </div>
                                    <ul className="slot-tooltip-weeks">
                                      {slot.weeks.map((wk) => (
                                        <li key={wk.date} className={wk.available ? "free" : "blocked"}>
                                          <span className="slot-tooltip-week-dot" aria-hidden />
                                          <span className="slot-tooltip-week-date">{format(parseISO(wk.date), "MMM d")}</span>
                                          <span className="slot-tooltip-week-status">{wk.available ? "Free" : "Booked"}</span>
                                        </li>
                                      ))}
                                    </ul>
                                    <Tooltip.Arrow className="slot-tooltip-arrow" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </article>
            )) : null}
          </section>
        </>
      )}

      {categoryModalOpen ? (
        <CategoryModal feeCategory={feeCategory} onClose={() => setCategoryModalOpen(false)} onSelect={selectFeeCategory} effectiveScheduleOrient={effectiveScheduleOrient} onChangeScheduleOrient={selectScheduleOrient} />
      ) : null}

      {gallerySpace ? <PhotoGalleryModal gallerySpace={gallerySpace} onClose={() => setGallerySpace(null)} /> : null}
    </main>
  );
}
