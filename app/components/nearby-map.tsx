"use client";

import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { NearbySchool } from "@/lib/api-contracts";
import { getSchoolStatus, getSchoolSummary, statusLabel } from "./nearby-school-status";
import type { NearbyPoint } from "./nearby-search-types";

type ConnectorEndpoint = { lat: number; lng: number };

export type NearbyMapHandle = {
  focusSchool: (school: NearbySchool) => void;
  highlightSchool: (facilityId: number, highlighted: boolean) => void;
};

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

function makeRadiusFeature(center: NearbyPoint, radiusKm: number) {
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

function setNearbyRadius(map: MapLibreMap, center: NearbyPoint, radiusKm: number) {
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

export const NearbyMap = forwardRef<NearbyMapHandle, {
  point: NearbyPoint;
  hasResults: boolean;
  schools: NearbySchool[];
  onPointChange: (point: NearbyPoint) => void;
}>(
  function NearbyMap({ point, hasResults, schools, onPointChange }, ref) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const markerRef = useRef<Marker | null>(null);
    const schoolMarkersRef = useRef<Marker[]>([]);
    const schoolMarkerByIdRef = useRef<Map<number, Marker>>(new Map());
    const hasResultsRef = useRef(false);
    const initialPointRef = useRef(point);
    const onPointChangeRef = useRef(onPointChange);
    const [mapReady, setMapReady] = useState(false);

    useEffect(() => {
      onPointChangeRef.current = onPointChange;
    }, [onPointChange]);

    useEffect(() => {
      hasResultsRef.current = hasResults;
    }, [hasResults]);

    useEffect(() => {
      if (!mapContainerRef.current) return;
      let disposed = false;
      const initialPoint = initialPointRef.current;
      const schoolMarkerById = schoolMarkerByIdRef.current;

      void import("maplibre-gl").then(({ default: maplibregl }) => {
        if (disposed || !mapContainerRef.current) return;
        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          center: [initialPoint.lng, initialPoint.lat],
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
          .setLngLat([initialPoint.lng, initialPoint.lat])
          .addTo(map);
        map.on("click", (event) => {
          if (hasResultsRef.current) return;
          const nextPoint = { lat: event.lngLat.lat, lng: event.lngLat.lng };
          marker.setLngLat([nextPoint.lng, nextPoint.lat]);
          onPointChangeRef.current(nextPoint);
        });
        mapRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
      });

      return () => {
        disposed = true;
        schoolMarkersRef.current.forEach((marker) => marker.remove());
        markerRef.current?.remove();
        mapRef.current?.remove();
        schoolMarkersRef.current = [];
        schoolMarkerById.clear();
        markerRef.current = null;
        mapRef.current = null;
      };
    }, []);

    useEffect(() => {
      markerRef.current?.setLngLat([point.lng, point.lat]);
    }, [point.lat, point.lng]);

    useImperativeHandle(ref, () => ({
      focusSchool(school) {
        const lat = school.facility.latitude;
        const lng = school.facility.longitude;
        if (!mapRef.current || lat == null || lng == null) return;
        const container = mapContainerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const viewHeight = window.innerHeight || document.documentElement.clientHeight;
          const visibleHeight = Math.max(0, Math.min(rect.bottom, viewHeight) - Math.max(rect.top, 0));
          if (visibleHeight < Math.min(rect.height, viewHeight) * 0.5) {
            container.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
        mapRef.current.easeTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 13.5), offset: [0, 110], duration: 500 });
        const target = schoolMarkerByIdRef.current.get(school.facility.id);
        schoolMarkersRef.current.forEach((m) => {
          if (m === target) return;
          const popup = m.getPopup();
          if (popup?.isOpen()) popup.remove();
        });
        if (target && !target.getPopup()?.isOpen()) target.togglePopup();
      },
      highlightSchool(facilityId, highlighted) {
        schoolMarkerByIdRef.current.get(facilityId)?.getElement().classList.toggle("is-highlighted", highlighted);
      },
    }), []);

    useEffect(() => {
      const visibleSchools = hasResults ? schools : [];
      schoolMarkersRef.current.forEach((marker) => marker.remove());
      schoolMarkersRef.current = [];
      schoolMarkerByIdRef.current.clear();
      if (!mapReady || !mapRef.current) return;

      if (!hasResults) {
        clearNearbyRadius(mapRef.current);
        clearNearbyConnectors(mapRef.current);
        return;
      }

      if (visibleSchools.length === 0) {
        clearNearbyConnectors(mapRef.current);
        const applyRadius = () => setNearbyRadius(mapRef.current!, point, 0.8);
        if (mapRef.current.isStyleLoaded()) applyRadius();
        else mapRef.current.once("load", applyRadius);
        return;
      }

      let cancelled = false;
      void import("maplibre-gl").then(({ default: maplibregl }) => {
        if (cancelled || !mapRef.current) return;
        const map = mapRef.current;
        const bounds = new maplibregl.LngLatBounds([point.lng, point.lat], [point.lng, point.lat]);
        let visibleSchoolCount = 0;
        let farthestSchoolKm = 0;
        const connectorTargets: ConnectorEndpoint[] = [];

        for (const [index, school] of visibleSchools.entries()) {
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
          statusPill.textContent = status === "partial"
            ? `${summary.openWeeks}/${summary.totalWeeks} time slots available`
            : statusLabel[status];
          const resultButton = document.createElement("button");
          resultButton.type = "button";
          resultButton.className = "school-popup-result-btn";
          resultButton.textContent = "Go to result";
          resultButton.addEventListener("click", (event) => {
            event.stopPropagation();
            document.getElementById(`nearby-result-${school.facility.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          popupElement.append(title, details, availability, statusPill, resultButton);

          const marker = new maplibregl.Marker({ element: markerElement, anchor: "center" })
            .setLngLat([lng, lat])
            .setPopup(new maplibregl.Popup({ offset: 18, anchor: "bottom" }).setDOMContent(popupElement))
            .addTo(map);
          markerElement.addEventListener("click", (event) => {
            event.stopImmediatePropagation();
            const wasOpen = marker.getPopup()?.isOpen() ?? false;
            schoolMarkersRef.current.forEach((m) => {
              const popup = m.getPopup();
              if (popup?.isOpen()) popup.remove();
            });
            map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13.5), offset: [0, 110], duration: 500 });
            if (!wasOpen) marker.togglePopup();
          }, { capture: true });
          schoolMarkersRef.current.push(marker);
          schoolMarkerByIdRef.current.set(school.facility.id, marker);
          bounds.extend([lng, lat]);
          farthestSchoolKm = Math.max(farthestSchoolKm, school.distanceKm);
          visibleSchoolCount += 1;
        }

        if (visibleSchoolCount > 0) {
          const applyOverlays = () => {
            setNearbyRadius(map, point, farthestSchoolKm + 0.35);
            setNearbyConnectors(map, point, connectorTargets);
          };
          if (map.isStyleLoaded()) applyOverlays();
          else map.once("load", applyOverlays);
          map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 600 });
        } else {
          clearNearbyConnectors(map);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [hasResults, mapReady, point, schools]);

    return (
      <div className="map-panel">
        <div ref={mapContainerRef} className="map-canvas" />
        <div className="map-overlay map-overlay-tl">
          <div className="selected-point floating">
            <strong>{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</strong>
            <span>Selected point</span>
          </div>
        </div>
        {hasResults && schools.length > 0 ? (
          <div className="map-overlay map-overlay-bl">
            <div className="legend floating" aria-label="Availability legend">
              <span><i className="dot available" />All weeks</span>
              <span><i className="dot partial" />Some weeks</span>
              <span><i className="dot unavailable" />No weeks</span>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);
