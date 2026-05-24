"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { useEffect, useMemo, useState } from "react";
import { binValues, percentileForValue, SQM_PER_SQFT } from "@/lib/space-area-stats";
import { SPACE_AREA_STATS_BY_TYPE } from "@/lib/space-area-stats.generated";

export type SpaceAreaModalContext = {
  spaceId: number;
  spaceName: string;
  schoolName: string;
  spaceTypeId: number;
  areaSqft: number | null;
  areaSqm: number | null;
};

type Unit = "sqft" | "sqm";

const BIN_COUNT = 12;
const SMALL_SAMPLE_THRESHOLD = 5;

const unitLabel: Record<Unit, string> = { sqft: "sqft", sqm: "sqm" };

function toUnit(valueSqft: number, unit: Unit): number {
  return unit === "sqft" ? valueSqft : valueSqft * SQM_PER_SQFT;
}

function formatDisplay(valueSqft: number, unit: Unit): string {
  const v = toUnit(valueSqft, unit);
  const rounded = unit === "sqft" ? Math.round(v) : Math.round(v * 10) / 10;
  return rounded.toLocaleString("en-CA", { maximumFractionDigits: unit === "sqft" ? 0 : 1 });
}

function formatBucketBounds(startSqft: number, endSqft: number, unit: Unit): string {
  return `${formatDisplay(startSqft, unit)}-${formatDisplay(endSqft, unit)} ${unitLabel[unit]}`;
}

function sizeComparisonTitle(percentile: number, categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (percentile < 40) return `This space is smaller than the average ${lower}`;
  if (percentile > 60) return `This space is larger than the average ${lower}`;
  return `This space is an average-sized ${lower}`;
}

export function SpaceAreaModal({
  context,
  onClose,
}: {
  context: SpaceAreaModalContext;
  onClose: () => void;
}) {
  const stats = SPACE_AREA_STATS_BY_TYPE[context.spaceTypeId] ?? null;
  const distribution = stats?.distribution ?? null;

  // Canonical = sqft. Convert sqm-only spaces so the marker still works.
  const currentValueSqft = context.areaSqft != null
    ? context.areaSqft
    : context.areaSqm != null ? context.areaSqm / SQM_PER_SQFT : null;

  const [unit, setUnit] = useState<Unit>("sqft");
  const [tappedBinKey, setTappedBinKey] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bins = useMemo(() => (distribution ? binValues(distribution.values, BIN_COUNT) : []), [distribution]);
  const tallest = useMemo(() => bins.reduce((max, b) => Math.max(max, b.count), 0), [bins]);

  const percentile = distribution && currentValueSqft != null
    ? percentileForValue(distribution.values, currentValueSqft)
    : null;

  const markerPct = useMemo(() => {
    if (!distribution || currentValueSqft == null) return null;
    const { min, max } = distribution;
    if (max === min) return 50;
    const clamped = Math.min(Math.max(currentValueSqft, min), max);
    return ((clamped - min) / (max - min)) * 100;
  }, [distribution, currentValueSqft]);

  return (
    <div
      className="photo-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="space-area-modal-title"
      onClick={onClose}
    >
      <div
        className="photo-modal area-modal"
        onClick={(event) => event.stopPropagation()}
        onPointerDownCapture={(event) => {
          if (event.pointerType === "mouse") return;
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest(".area-bar, .area-tooltip")) return;
          setTappedBinKey(null);
        }}
      >
        <header className="photo-modal-header">
          <div>
            <h3 id="space-area-modal-title">
              {stats && percentile != null
                ? sizeComparisonTitle(percentile, stats.name)
                : `${context.spaceName} — size`}
            </h3>
          </div>
          <button type="button" className="photo-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="photo-modal-body area-modal-body">
          {!stats || !distribution ? (
            <div className="photo-modal-status">No size data available for this space type.</div>
          ) : (
            <>
              <div className="area-summary">
                <div className="area-summary-headline">
                  {currentValueSqft == null ? (
                    <span className="area-summary-pct">
                      No measurement on file for this space. Showing the distribution for {distribution.count.toLocaleString("en-CA")} {stats.name.toLowerCase()} spaces.
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="area-histogram-wrap">
                <div className="area-histogram">
                  {bins.map((bin, i) => {
                    const binKey = `${bin.start}-${i}`;
                    const height = tallest === 0 ? 0 : (bin.count / tallest) * 100;
                    const containsCurrent = currentValueSqft != null && currentValueSqft >= bin.start && (i === bins.length - 1 ? currentValueSqft <= bin.end : currentValueSqft < bin.end);
                    const bucketBounds = formatBucketBounds(bin.start, bin.end, unit);
                    return (
                      <Tooltip.Root
                        key={binKey}
                        open={tappedBinKey === binKey ? true : undefined}
                      >
                        <Tooltip.Trigger asChild>
                          <button
                            type="button"
                            className={`area-bar${containsCurrent ? " is-current" : ""}`}
                            style={{ height: `${height}%` }}
                            aria-label={`${bucketBounds}: ${bin.count.toLocaleString("en-CA")} spaces`}
                            onPointerUp={(event) => {
                              if (event.pointerType !== "mouse") {
                                event.preventDefault();
                                setTappedBinKey((current) => current === binKey ? null : binKey);
                              }
                            }}
                          >
                            <span className="area-bar-count">{bin.count}</span>
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Content className="area-tooltip" side="top" sideOffset={6}>
                          <div className="area-tooltip-title">{bucketBounds}</div>
                          <div className="area-tooltip-meta">{bin.count.toLocaleString("en-CA")} spaces</div>
                          <Tooltip.Arrow className="area-tooltip-arrow" />
                        </Tooltip.Content>
                      </Tooltip.Root>
                    );
                  })}
                  {markerPct != null ? (
                    <div className="area-marker" style={{ left: `${markerPct}%` }} aria-hidden>
                      <span className="area-marker-label">{formatDisplay(currentValueSqft!, unit)} {unitLabel[unit]}</span>
                      <span className="area-marker-line" />
                      <span className="area-marker-dot" />
                    </div>
                  ) : null}
                </div>
                <div className="area-axis">
                  <span>{formatDisplay(distribution.min, unit)}</span>
                  <span>{formatDisplay(distribution.max, unit)}</span>
                </div>
                <div className="area-axis-label">{unitLabel[unit]}</div>
              </div>

              <dl className="area-summary-stats">
                <div><dt>Sample</dt><dd>{distribution.count.toLocaleString("en-CA")}</dd></div>
                <div><dt>Median</dt><dd>{formatDisplay(distribution.median, unit)}</dd></div>
                <div><dt>Mean</dt><dd>{formatDisplay(distribution.mean, unit)}</dd></div>
                <div><dt>Range</dt><dd>{formatDisplay(distribution.min, unit)}&ndash;{formatDisplay(distribution.max, unit)}</dd></div>
              </dl>
              <p className="meta area-modal-facility">{context.spaceName} · {context.schoolName}</p>

              {distribution.count < SMALL_SAMPLE_THRESHOLD ? (
                <p className="meta area-modal-foot">Small sample &mdash; only {distribution.count} {stats.name.toLowerCase()} spaces in TDSB have a recorded size.</p>
              ) : null}

              <div className="area-unit-toggle" role="tablist" aria-label="Units">
                <button type="button" role="tab" aria-selected={unit === "sqft"} className={unit === "sqft" ? "active" : ""} onClick={() => setUnit("sqft")}>sqft</button>
                <button type="button" role="tab" aria-selected={unit === "sqm"} className={unit === "sqm" ? "active" : ""} onClick={() => setUnit("sqm")}>sqm</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
