"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { format, parseISO } from "date-fns";
import { useEffect, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import type { NearbySchool } from "@/lib/api-contracts";
import type { FeeCategory } from "@/lib/fees";
import { historicalHatchLevelForSlot } from "@/lib/nearby-slots";
import { SPACE_AREA_STATS_BY_TYPE } from "@/lib/space-area-stats.generated";
import { FeeBadge } from "./fee-ui";
import { LegendModal } from "./legend-modal";
import { getSchoolStatus } from "./nearby-school-status";
import type { GallerySpace } from "./photo-gallery-modal";
import { SpaceAreaModal, type SpaceAreaModalContext } from "./space-area-modal";

function hasAreaStatsForSpace(spaceTypeId: number | null | undefined): boolean {
  if (spaceTypeId == null) return false;
  const stats = SPACE_AREA_STATS_BY_TYPE[spaceTypeId];
  return Boolean(stats?.distribution);
}

const slotStatusLabel: Record<"available" | "mostly" | "limited" | "unavailable", string> = {
  available: "Almost always available",
  mostly: "Mostly available",
  limited: "Mostly not available",
  unavailable: "Almost never available",
};

type TooltipWeek = NearbySchool["schedule"][number]["slots"][number]["weeks"][number];

function historicalYearsForWeek(week: TooltipWeek): number[] {
  return [...new Set(week.spaces.flatMap((space) => space.historicallyBookedYears))]
    .sort((a, b) => a - b);
}

function historicalWeekLabel(years: number[]): string {
  if (years.includes(1) && years.includes(2)) return "Historically booked in both prior years";
  if (years.includes(1)) return "Historically booked last year";
  if (years.includes(2)) return "Historically booked two years ago";
  return "";
}

function lastYearStatusForWeek(week: TooltipWeek): "Free" | "Booked" {
  return historicalYearsForWeek(week).includes(1) ? "Booked" : "Free";
}

const DISCLAIMER_DISMISSED_KEY = "nearby-disclaimer-dismissed";

export function NearbyResults({
  error,
  showResults,
  schools,
  feeCategory,
  onOpenGallery,
  onFocusSchool,
  onHighlightSchool,
}: {
  error: Error | null;
  showResults: boolean;
  schools: NearbySchool[];
  feeCategory: FeeCategory;
  onOpenGallery: (gallerySpace: GallerySpace) => void;
  onFocusSchool: (school: NearbySchool) => void;
  onHighlightSchool: (facilityId: number, highlighted: boolean) => void;
}) {
  const [pinnedSlotKey, setPinnedSlotKey] = useState<string | null>(null);
  const [hoveredSlotKey, setHoveredSlotKey] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [areaModalContext, setAreaModalContext] = useState<SpaceAreaModalContext | null>(null);
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISCLAIMER_DISMISSED_KEY) === "true") {
      setDisclaimerDismissed(true);
    }
  }, []);

  const dismissDisclaimer = () => {
    setDisclaimerDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(DISCLAIMER_DISMISSED_KEY, "true");
    }
  };

  useEffect(() => {
    if (!pinnedSlotKey) return;
    const handler = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".slot-cell, .slot-tooltip")) return;
      setPinnedSlotKey(null);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [pinnedSlotKey]);

  return (
    <section className="results">
      {error ? <div className="card empty">{error.message}</div> : null}
      {showResults && schools.length === 0 ? <div className="card empty">No schools with that public room type and coordinates were found.</div> : null}
      {showResults && schools.length > 0 && !disclaimerDismissed ? (
        <div className="card nearby-disclaimer" role="note">
          <span className="nearby-disclaimer-icon" aria-hidden>⚠︎</span>
          <p>
            <span className="nearby-disclaimer-icon-inline" aria-hidden>⚠️ </span>
            This tool only helps you find open spaces. To submit a permit application, you&apos;ll need to do it through{" "}
            <a
              href="https://tdsb.ebasefm.com/login.aspx"
              target="_blank"
              rel="noopener noreferrer"
            >
              eBase
            </a>
            .
          </p>
          <button
            type="button"
            className="nearby-disclaimer-dismiss"
            onClick={dismissDisclaimer}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}
      {showResults ? schools.map((school, schoolIdx) => (
        <article
          className="card nearby-result"
          id={`nearby-result-${school.facility.id}`}
          key={school.facility.id}
          onMouseEnter={() => onHighlightSchool(school.facility.id, true)}
          onMouseLeave={() => onHighlightSchool(school.facility.id, false)}
        >
          <div className="nearby-heading">
            <div className="nearby-heading-text">
              <div className="nearby-title-row">
                <button
                  type="button"
                  className={`nearby-rank ${getSchoolStatus(school)}`}
                  onClick={() => onFocusSchool(school)}
                  aria-label={`Show result ${schoolIdx + 1} on map`}
                >
                  {schoolIdx + 1}
                </button>
                <div className="nearby-title-text">
                  <h3>{school.facility.name}</h3>
                  <div className="meta">{school.facility.address} {school.facility.city} {school.facility.postalCode}</div>
                </div>
              </div>
            </div>
            <div className="nearby-heading-actions">
              <button type="button" className={`distance-pill ${getSchoolStatus(school)}`} onClick={() => onFocusSchool(school)}>{school.distanceKm.toFixed(1)} km</button>
              {school.spaces[0] ? (
                <FeeBadge spaceTypeId={school.spaces[0].spaceTypeId} category={feeCategory} />
              ) : null}
              {school.spaces[0] ? (
                <button
                  type="button"
                  className="photos-icon-btn nearby-action-btn"
                  onClick={() => onOpenGallery({ schoolName: school.facility.name, space: { id: school.spaces[0].id, name: school.spaces[0].name } })}
                  aria-label={`View photos of ${school.spaces[0].name}`}
                  title="View photos"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
              ) : null}
              {school.spaces[0] && hasAreaStatsForSpace(school.spaces[0].spaceTypeId) && school.spaces[0].spaceTypeId != null ? (
                <button
                  type="button"
                  className="photos-icon-btn nearby-action-btn"
                  onClick={() => setAreaModalContext({
                    spaceId: school.spaces[0].id,
                    spaceName: school.spaces[0].name,
                    schoolName: school.facility.name,
                    spaceTypeId: school.spaces[0].spaceTypeId!,
                    areaSqft: school.spaces[0].areaSqft ?? null,
                    areaSqm: school.spaces[0].areaSqm ?? null,
                  })}
                  aria-label={`Compare size of ${school.spaces[0].name} to other spaces of this type`}
                  title="Compare size"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="11" x2="12" y2="16.5" />
                    <circle cx="12" cy="7.75" r="0.6" fill="currentColor" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
          <SchoolScheduleGrid
            school={school}
            pinnedSlotKey={pinnedSlotKey}
            hoveredSlotKey={hoveredSlotKey}
            onPinSlot={setPinnedSlotKey}
            onHoverSlot={setHoveredSlotKey}
          />
          {schoolIdx === 0 ? (
            <div className="nearby-result-legend">
              <button type="button" className="secondary ghost legend-btn" onClick={() => setLegendOpen(true)}>
                What am I looking at?
              </button>
            </div>
          ) : null}
        </article>
      )) : null}
      {legendOpen ? <LegendModal onClose={() => setLegendOpen(false)} /> : null}
      {areaModalContext ? (
        <SpaceAreaModal context={areaModalContext} onClose={() => setAreaModalContext(null)} />
      ) : null}
    </section>
  );
}

function SchoolScheduleGrid({
  school,
  pinnedSlotKey,
  hoveredSlotKey,
  onPinSlot,
  onHoverSlot,
}: {
  school: NearbySchool;
  pinnedSlotKey: string | null;
  hoveredSlotKey: string | null;
  onPinSlot: Dispatch<SetStateAction<string | null>>;
  onHoverSlot: Dispatch<SetStateAction<string | null>>;
}) {
  const slotTemplate = school.schedule[0]?.slots ?? [];
  if (slotTemplate.length === 0) return <div className="schedule-grid empty">No time slots in the requested window.</div>;

  return (
    <div className="schedule-grid" role="grid" aria-label={`${school.facility.name} weekly schedule`}>
      <div className="schedule-header" role="row">
        <span className="schedule-corner" aria-hidden />
        {school.schedule.map((day, dayIdx) => (
          <span key={day.day} className="schedule-day-label" role="columnheader" style={{ "--day-idx": dayIdx } as CSSProperties}>{day.label}</span>
        ))}
      </div>
      {slotTemplate.map((templateSlot, idx) => (
        <div className="schedule-row" key={templateSlot.start} role="row">
          <span className="schedule-time-label" role="rowheader" style={{ "--slot-idx": idx } as CSSProperties}>{templateSlot.start}</span>
          {school.schedule.map((day, dayIdx) => {
            const slot = day.slots[idx];
            const historicalHatchLevel = historicalHatchLevelForSlot(slot);
            const slotKey = `${school.facility.id}:${dayIdx}:${idx}`;
            const isOpen = pinnedSlotKey === slotKey || hoveredSlotKey === slotKey;
            const weekRows = slot.weeks.map((wk) => ({
              week: wk,
              historicalYears: historicalYearsForWeek(wk),
            }));
            return (
              <Tooltip.Root
                key={day.day}
                open={isOpen}
                onOpenChange={(open) => {
                  if (open) {
                    const contributingWeeks = slot.weeks.filter((wk) => (
                      wk.spaces.some((space) => space.historicallyBookedYears.includes(1))
                    ));
                    const num = contributingWeeks.length;
                    const denom = slot.totalWeeks;
                    const ratio = denom > 0 ? num / denom : 0;
                    console.log(
                      `[hatch] ${school.facility.name} · ${day.label} ${slot.start}–${slot.end}: ${num}/${denom} = ${ratio.toFixed(3)} → ${historicalHatchLevel}`,
                      {
                        rule: "ratio > 0.6 → strong, ratio ≥ 0.4 → light, else none",
                        contributingDates: contributingWeeks.map((wk) => wk.date),
                        allWeeks: slot.weeks.map((wk) => ({
                          date: wk.date,
                          available: wk.available,
                          spaceIdsBookedLastYear: wk.spaces
                            .filter((space) => space.historicallyBookedYears.includes(1))
                            .map((space) => space.spaceId),
                        })),
                      },
                    );
                  }
                  onHoverSlot((prev) => {
                    if (open) return slotKey;
                    return prev === slotKey ? null : prev;
                  });
                }}
              >
                <Tooltip.Trigger asChild>
                  <span
                    role="gridcell"
                    tabIndex={0}
                    className={`slot-cell ${slot.status}${historicalHatchLevel !== "none" ? ` slot-cell--historical slot-cell--historical-${historicalHatchLevel}` : ""}${isOpen ? " slot-cell--active" : ""}`}
                    style={{ "--day-idx": dayIdx, "--slot-idx": idx } as CSSProperties}
                    aria-label={`${day.label} ${slot.start} to ${slot.end}: ${slot.availableWeeks} of ${slot.totalWeeks} weeks free`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPinSlot((prev) => (prev === slotKey ? null : slotKey));
                    }}
                  />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="slot-tooltip slot-tooltip--history" side="top" sideOffset={6}>
                    <div className="slot-tooltip-row">
                      <strong>{day.label} · {slot.start}–{slot.end}</strong>
                    </div>
                    <div className={`slot-tooltip-row slot-tooltip-status ${slot.status}`}>
                      {slotStatusLabel[slot.status]}
                    </div>
                    <div className="slot-tooltip-row slot-tooltip-meta">
                      {slot.availableWeeks} of {slot.totalWeeks} weeks free
                    </div>
                    <ul className="slot-tooltip-weeks has-history">
                      <li className="slot-tooltip-week-header" aria-hidden>
                        <span />
                        <span>Date</span>
                        <span>This yr</span>
                        <span>Last yr</span>
                      </li>
                      {weekRows.map(({ week: wk, historicalYears }) => {
                        const historicalLabel = historicalWeekLabel(historicalYears);
                        const lastYearStatus = lastYearStatusForWeek(wk);
                        return (
                          <li key={wk.date} className={`${wk.available ? "free" : "blocked"}${historicalYears.length > 0 ? " historical" : ""}`}>
                            <span className="slot-tooltip-week-dot" aria-hidden />
                            <span className="slot-tooltip-week-date">{format(parseISO(wk.date), "MMM d")}</span>
                            <span className="slot-tooltip-week-status">{wk.available ? "Free" : "Booked"}</span>
                            <span
                              className={`slot-tooltip-last-year ${lastYearStatus === "Free" ? "free" : "booked"}`}
                              aria-label={historicalYears.length > 0 ? historicalLabel : undefined}
                              title={historicalYears.length > 0 ? historicalLabel : undefined}
                            >
                              {lastYearStatus}
                            </span>
                          </li>
                        );
                      })}
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
}
