"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryModal, SettingsButton } from "@/app/components/fee-ui";
import type { NearbyMapHandle } from "@/app/components/nearby-map";
import { NearbyResults } from "@/app/components/nearby-results";
import { NearbySearchCard } from "@/app/components/nearby-search-card";
import { PermitWindowModal } from "@/app/components/permit-window-modal";
import { PhotoGalleryModal, type GallerySpace } from "@/app/components/photo-gallery-modal";
import { useNearbySearch } from "@/app/hooks/use-nearby-search";
import { usePermitFinderSettings } from "@/app/hooks/use-permit-finder-settings";
import { trackEvent } from "@/lib/analytics";
import { formatTdsbTimestamp } from "@/lib/time";

export function PermitFinderApp({ autoSearch = false }: { autoSearch?: boolean }) {
  const mapRef = useRef<NearbyMapHandle>(null);
  const [gallerySpace, setGallerySpace] = useState<GallerySpace | null>(null);
  const [permitWindowOpen, setPermitWindowOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const {
    nearbyForm,
    setNearbyForm,
    spaceTypeId,
    setSpaceTypeId,
    spaceTypes,
    syncStatus,
    nearby,
    hasCurrentNearbyResults,
    startNearbySearch,
    resetNearbySearch,
  } = useNearbySearch();

  const {
    feeCategory,
    categoryModalOpen,
    setCategoryModalOpen,
    effectiveScheduleOrient,
    selectFeeCategory,
    selectScheduleOrient,
  } = usePermitFinderSettings();

  const autoSearchFired = useRef(false);
  useEffect(() => {
    if (!autoSearch || autoSearchFired.current) return;
    autoSearchFired.current = true;
    startNearbySearch();
  }, [autoSearch, startNearbySearch]);

  const schools = hasCurrentNearbyResults ? nearby.data?.schools ?? [] : [];
  const lastInventorySyncAt = syncStatus.inventory?.lastSuccessfulSyncAt;

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
        {lastInventorySyncAt ? (
          <p className="hero-sync-status">
            Last Updated <time dateTime={lastInventorySyncAt}>{formatTdsbTimestamp(lastInventorySyncAt)}</time>
          </p>
        ) : null}
      </section>

      <NearbySearchCard
        nearbyForm={nearbyForm}
        onNearbyFormChange={setNearbyForm}
        spaceTypes={spaceTypes}
        spaceTypeId={spaceTypeId}
        onSpaceTypeIdChange={(id) => {
          setSpaceTypeId(id);
          trackEvent("space_type_selected", { space_type_id: id });
        }}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((current) => !current)}
        hasResults={hasCurrentNearbyResults}
        schools={schools}
        isPending={nearby.isPending}
        onSearch={() => {
          trackEvent("search_initiated", { space_type_id: spaceTypeId });
          startNearbySearch();
        }}
        onReset={resetNearbySearch}
        onOpenPermitWindow={() => {
          trackEvent("permit_window_opened");
          setPermitWindowOpen(true);
        }}
        mapRef={mapRef}
      />

      <NearbyResults
        error={nearby.error}
        showResults={hasCurrentNearbyResults}
        schools={schools}
        feeCategory={feeCategory}
        onOpenGallery={(space) => {
          trackEvent("photo_gallery_opened", {
            space_id: space.space.id,
            space_name: space.space.name,
            school_name: space.schoolName,
          });
          setGallerySpace(space);
        }}
        onFocusSchool={(school) => mapRef.current?.focusSchool(school)}
        onHighlightSchool={(facilityId, highlighted) => mapRef.current?.highlightSchool(facilityId, highlighted)}
      />

      {categoryModalOpen ? (
        <CategoryModal
          feeCategory={feeCategory}
          onClose={() => setCategoryModalOpen(false)}
          onSelect={selectFeeCategory}
          effectiveScheduleOrient={effectiveScheduleOrient}
          onChangeScheduleOrient={selectScheduleOrient}
        />
      ) : null}

      {gallerySpace ? <PhotoGalleryModal gallerySpace={gallerySpace} onClose={() => setGallerySpace(null)} /> : null}

      {permitWindowOpen ? <PermitWindowModal onClose={() => setPermitWindowOpen(false)} /> : null}
    </main>
  );
}
