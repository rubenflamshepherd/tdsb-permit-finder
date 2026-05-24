"use client";

import { useEffect, useState } from "react";

const STATUS_ROWS: Array<{ status: "available" | "mostly" | "limited" | "unavailable"; label: string; blurb: string }> = [
  { status: "available", label: "Almost always available", blurb: "All (or nearly all) weeks in the requested window look free." },
  { status: "mostly", label: "Mostly available", blurb: "Most weeks look free, but a few are already booked." },
  { status: "limited", label: "Mostly not available", blurb: "Most weeks are booked; only a handful look free." },
  { status: "unavailable", label: "Almost never available", blurb: "Every (or nearly every) week is already booked." },
];

const HATCH_ROWS: Array<{ level: "light" | "strong"; label: string; blurb: string }> = [
  { level: "light", label: "Some history of bookings", blurb: "Around 40-60% of the weeks in your window were booked at this same slot last year." },
  { level: "strong", label: "Heavy history of bookings", blurb: "More than 60% of the weeks in your window were booked at this same slot last year - expect competition." },
];

export function LegendModal({ onClose }: { onClose: () => void }) {
  const [canHover, setCanHover] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const interactionVerb = canHover ? "Hover over" : "Tap";

  return (
    <div
      className="photo-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legend-modal-title"
      onClick={onClose}
    >
      <div className="photo-modal category-modal" onClick={(event) => event.stopPropagation()}>
        <header className="photo-modal-header">
          <div>
            <h3 id="legend-modal-title">What am I looking at?</h3>
            <p className="meta">Each cell is one weekday + time slot across the weeks you searched. {interactionVerb} any cell to see the week-by-week breakdown, including last year&rsquo;s booking history.</p>
          </div>
          <button type="button" className="photo-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="photo-modal-body category-modal-body">
          <div>
            <div className="modal-section-label">Cell colour - this year&rsquo;s availability</div>
            <ul className="legend-list">
              {STATUS_ROWS.map((row) => (
                <li key={row.status}>
                  <span className={`legend-swatch slot-cell ${row.status}`} aria-hidden />
                  <div>
                    <strong>{row.label}</strong>
                    <span className="meta">{row.blurb}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="modal-section">
            <div className="modal-section-label">Diagonal hatching - last year&rsquo;s booking history</div>
            <p className="meta category-modal-intro">
              Hatching reflects how many of the weeks in your window were booked at this same weekday and time <em>last year</em> &mdash; whether or not they&rsquo;re still free this year. It&rsquo;s a hint that a recurring permit holder may grab the slot again.
            </p>
            <ul className="legend-list">
              {HATCH_ROWS.map((row) => (
                <li key={row.level}>
                  <span className={`legend-swatch slot-cell available slot-cell--historical slot-cell--historical-${row.level}`} aria-hidden />
                  <div>
                    <strong>{row.label}</strong>
                    <span className="meta">{row.blurb}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
