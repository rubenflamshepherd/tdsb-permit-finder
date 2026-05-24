"use client";

import { useEffect, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { isDeadlineBannerDismissed, restoreDeadlineBanner } from "@/app/components/deadline-banner";
import { CATEGORY_LABELS, getFee, type FeeCategory, type TimeOfUse } from "@/lib/fees";

type SettingsTab = "subsidy" | "other";

export const FEE_CATEGORIES: FeeCategory[] = ["A1", "A2", "B", "C"];
export const CATEGORY_STORAGE_KEY = "tdsb-permit-finder.feeCategory";
export const SCHEDULE_ORIENT_STORAGE_KEY = "tdsb-permit-finder.scheduleOrient";
export type ScheduleOrient = "auto" | "days" | "times";
export type EffectiveScheduleOrient = "days" | "times";

const CATEGORY_DETAILS: Record<FeeCategory, { title: string; tagline: string; blurb: string }> = {
  A1: {
    title: "(A1) Youth, Seniors & Marginalized Groups",
    tagline: "Highest subsidy",
    blurb: "Toronto-based not-for-profit serving children/youth under 18, persons with disabilities under 28, seniors 65+, or marginalized groups (e.g. Scouts, Boys & Girls Clubs, indigenous and newcomer programs).",
  },
  A2: {
    title: "(A2) Other not-for-profit",
    tagline: "Partial subsidy",
    blurb: "Toronto-based not-for-profit serving the local community - faith-based charities, theatrical/music groups, historical societies, adult sport/recreation.",
  },
  B: {
    title: "(B) Cost Recovery",
    tagline: "Standard rate",
    blurb: "Non-profits or individuals who don't meet A1/A2, non-Toronto groups, political parties, fundraisers, tournaments charging fees, or activities run by paid staff.",
  },
  C: {
    title: "(C) Private / Commercial",
    tagline: "Commercial rate",
    blurb: "For-profit individuals or businesses - private camps, sport/social clubs, dance/music/driving schools, trade shows, commercial events.",
  },
};

const TIME_OF_USE_LABELS: Record<Exclude<TimeOfUse, "outdoor">, string> = {
  "school-day": "Weekday eve (6-10 pm)",
  "school-break": "School break (8 am-5 pm)",
  "saturday": "Saturday (8 am-6 pm)",
  "sunday-holiday": "Sun & holiday (8 am-3 pm)",
};

const SHORT_TIME_LABEL: Record<Exclude<TimeOfUse, "outdoor">, string> = {
  "school-day": "weekday eve",
  "school-break": "school break",
  "saturday": "Sat",
  "sunday-holiday": "Sun / hol",
};

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function FeeBadge({
  spaceTypeId,
  category,
  timeOfUse = "school-day",
}: {
  spaceTypeId: number | null | undefined;
  category: FeeCategory;
  timeOfUse?: Exclude<TimeOfUse, "outdoor" | "school-break">;
}) {
  if (spaceTypeId == null) return null;
  const outdoorRate = getFee(spaceTypeId, category, "outdoor");
  const indoorRates = outdoorRate == null
    ? (Object.keys(TIME_OF_USE_LABELS) as Array<keyof typeof TIME_OF_USE_LABELS>)
        .map((tou) => ({ tou, fee: getFee(spaceTypeId, category, tou) }))
    : [];
  const primary = outdoorRate ?? indoorRates.find((r) => r.tou === timeOfUse)?.fee ?? null;
  if (primary == null) return <span className="fee-badge fee-badge-unknown" title="Rate not published">No published rate</span>;

  const isWeekend = timeOfUse === "saturday" || timeOfUse === "sunday-holiday";

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className={`fee-badge${isWeekend ? " fee-badge-weekend" : ""}`} tabIndex={0}>
          {formatCurrency(primary)}/hr
          <em className="fee-badge-cat">{outdoorRate != null ? category : `${SHORT_TIME_LABEL[timeOfUse]} · ${category}`}</em>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="fee-tooltip" side="top" sideOffset={6}>
          <div className="fee-tooltip-title">Hourly rate · Category {category}</div>
          {outdoorRate != null ? (
            <div className="fee-tooltip-row"><span>Outdoor field</span><strong>{formatCurrency(outdoorRate)}</strong></div>
          ) : indoorRates.map(({ tou, fee }) => (
            <div className={`fee-tooltip-row${tou === timeOfUse ? " fee-tooltip-row-active" : ""}`} key={tou}>
              <span>{TIME_OF_USE_LABELS[tou]}</span>
              <strong>{fee != null ? formatCurrency(fee) : "-"}</strong>
            </div>
          ))}
          <div className="fee-tooltip-foot">+ HST. Caretaking surcharges may apply.</div>
          <Tooltip.Arrow className="fee-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function SettingsButton({
  feeCategory,
  onClick,
}: {
  feeCategory: FeeCategory;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="settings-fab"
      onClick={onClick}
      aria-label={`Open settings. Current category: ${CATEGORY_LABELS[feeCategory]}`}
      title="Settings"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span className="settings-fab-cat">{feeCategory}</span>
    </button>
  );
}

export function CategoryModal({
  feeCategory,
  onClose,
  onSelect,
  effectiveScheduleOrient,
  onChangeScheduleOrient,
}: {
  feeCategory: FeeCategory;
  onClose: () => void;
  onSelect: (category: FeeCategory) => void;
  effectiveScheduleOrient: EffectiveScheduleOrient;
  onChangeScheduleOrient: (next: EffectiveScheduleOrient) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("subsidy");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => {
    if (tab === "other") setBannerDismissed(isDeadlineBannerDismissed());
  }, [tab]);
  const handleRestoreBanner = () => {
    restoreDeadlineBanner();
    setBannerDismissed(false);
  };
  return (
    <div
      className="photo-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
      onClick={onClose}
    >
      <div className="photo-modal category-modal" onClick={(event) => event.stopPropagation()}>
        <header className="photo-modal-header">
          <div>
            <h3 id="category-modal-title">Settings</h3>
          </div>
          <button type="button" className="photo-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <nav className="tabs category-modal-tabs" aria-label="Settings sections">
          <button
            type="button"
            className={tab === "subsidy" ? "active" : ""}
            onClick={() => setTab("subsidy")}
            aria-pressed={tab === "subsidy"}
          >Subsidy</button>
          <button
            type="button"
            className={tab === "other" ? "active" : ""}
            onClick={() => setTab("other")}
            aria-pressed={tab === "other"}
          >Other</button>
        </nav>
        <div className="photo-modal-body category-modal-body">
          {tab === "subsidy" ? (
            <>
              <div className="meta category-modal-intro">TDSB charges different hourly rates based on the type of group renting the space. Pick the one that fits - you can change it later.</div>
              <div className="category-options" role="radiogroup" aria-label="Group category">
                {FEE_CATEGORIES.map((cat) => {
                  const detail = CATEGORY_DETAILS[cat];
                  const active = cat === feeCategory;
                  return (
                    <button
                      key={cat}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`category-option${active ? " active" : ""}`}
                      onClick={() => onSelect(cat)}
                    >
                      <div className="category-option-head">
                        <strong>{detail.title}</strong>
                        <span className="category-option-tag">{detail.tagline}</span>
                      </div>
                      <span className="category-option-blurb">{detail.blurb}</span>
                    </button>
                  );
                })}
              </div>
              <p className="category-modal-source">
                Rates from the{" "}
                <a
                  href="https://www.tdsb.on.ca/Portals/0/community/Permits/G02%20Fees%202025-2026.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  TDSB Facility Permit Fees schedule (Sept 2025 - Aug 2026)
                </a>.
              </p>
            </>
          ) : (
            <>
              <div role="group" aria-labelledby="schedule-layout-label">
                <div id="schedule-layout-label" className="modal-section-label">Schedule layout</div>
                <div className="segment">
                  <button
                    type="button"
                    className={effectiveScheduleOrient === "days" ? "active" : ""}
                    onClick={() => onChangeScheduleOrient("days")}
                    aria-pressed={effectiveScheduleOrient === "days"}
                  >Days as rows</button>
                  <button
                    type="button"
                    className={effectiveScheduleOrient === "times" ? "active" : ""}
                    onClick={() => onChangeScheduleOrient("times")}
                    aria-pressed={effectiveScheduleOrient === "times"}
                  >Times as rows</button>
                </div>
              </div>
              <div role="group" aria-labelledby="notifications-label">
                <div id="notifications-label" className="modal-section-label">Deadline banner</div>
                <p className="meta category-modal-intro">
                  {bannerDismissed
                    ? "The banner reminding you of the next TDSB bulk-processing deadline is currently hidden."
                    : "The banner reminding you of the next TDSB bulk-processing deadline is currently visible at the top of the page."}
                </p>
                <button
                  type="button"
                  className="secondary ghost"
                  onClick={handleRestoreBanner}
                  disabled={!bannerDismissed}
                >Show deadline banner</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
