"use client";

import type { Dispatch, Ref, SetStateAction } from "react";
import type { NearbySchool } from "@/lib/api-contracts";
import { NearbyMap, type NearbyMapHandle } from "./nearby-map";
import type { NearbyForm, SpaceType } from "./nearby-search-types";
import { SpaceTypePicker } from "./space-type-picker";

export function NearbySearchCard({
  nearbyForm,
  onNearbyFormChange,
  spaceTypes,
  spaceTypeId,
  onSpaceTypeIdChange,
  filtersOpen,
  onToggleFilters,
  hasResults,
  schools,
  isPending,
  onSearch,
  onReset,
  onOpenPermitWindow,
  mapRef,
}: {
  nearbyForm: NearbyForm;
  onNearbyFormChange: Dispatch<SetStateAction<NearbyForm>>;
  spaceTypes: SpaceType[];
  spaceTypeId: string;
  onSpaceTypeIdChange: (id: string) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  hasResults: boolean;
  schools: NearbySchool[];
  isPending: boolean;
  onSearch: () => void;
  onReset: () => void;
  onOpenPermitWindow: () => void;
  mapRef: Ref<NearbyMapHandle>;
}) {
  return (
    <section className="card search map-search">
      <div className="search-header">
        <div>
          <p>Click the map, then find the closest schools with your desired room type and weekly availability.</p>
        </div>
        <div className="search-header-actions">
          {hasResults ? (
            <button type="button" className="secondary" onClick={onReset}>New search</button>
          ) : (
            <button className="secondary" onClick={onSearch} disabled={isPending}>{isPending ? "Checking..." : "Find closest schools"}</button>
          )}
        </div>
      </div>
      <div className="map-layout">
        <NearbyMap
          ref={mapRef}
          point={nearbyForm.point}
          hasResults={hasResults}
          schools={schools}
          onPointChange={(point) => onNearbyFormChange((current) => ({ ...current, point }))}
        />
        <div className={`map-controls${filtersOpen ? " is-open" : ""}`}>
          <button
            type="button"
            className="map-controls-handle"
            onClick={onToggleFilters}
            aria-expanded={filtersOpen}
            aria-controls="map-controls-fields"
          >
            <span className="map-controls-handle-grab" aria-hidden />
            <span className="map-controls-handle-label">Filters</span>
            <span className="map-controls-handle-chevron" aria-hidden>{filtersOpen ? "▾" : "▴"}</span>
          </button>
          <div id="map-controls-fields" className="grid compact-grid map-controls-fields">
            <SpaceTypePicker spaceTypes={spaceTypes} value={spaceTypeId} onChange={onSpaceTypeIdChange} />
            <label>
              <span className="field-label">
                From week of
                <button
                  type="button"
                  className="field-help"
                  aria-label="About the school-year permit window"
                  onClick={onOpenPermitWindow}
                >?</button>
              </span>
              <input type="date" value={nearbyForm.startDate} onChange={(event) => onNearbyFormChange((current) => ({ ...current, startDate: event.target.value }))} />
            </label>
            <label>Search this many weeks<input type="number" min="1" max="26" value={nearbyForm.weeks} onChange={(event) => onNearbyFormChange((current) => ({ ...current, weeks: Number(event.target.value) }))} /></label>
            <label>Get this many schools<input type="number" min="1" max="30" value={nearbyForm.limit} onChange={(event) => onNearbyFormChange((current) => ({ ...current, limit: Math.min(30, Math.max(1, Number(event.target.value) || 1)) }))} /></label>
            <label>Start time<input type="time" value={nearbyForm.startTime} onChange={(event) => onNearbyFormChange((current) => ({ ...current, startTime: event.target.value }))} /></label>
            <label>End time<input type="time" value={nearbyForm.endTime} onChange={(event) => onNearbyFormChange((current) => ({ ...current, endTime: event.target.value }))} /></label>
          </div>
        </div>
      </div>
    </section>
  );
}
