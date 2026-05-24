"use client";

const SOURCE_URL = "https://www.tdsb.on.ca/Community/Permits/Dates-and-Times-of-Use";

const BLACKOUTS: Array<{ date: string; label: string }> = [
  { date: "Sep 1, 2025",            label: "Labour Day" },
  { date: "Sep 2–5, 2025",          label: "First week of school" },
  { date: "Oct 13, 2025",           label: "Thanksgiving" },
  { date: "Dec 22, 2025 – Jan 2, 2026", label: "Winter Break" },
  { date: "Feb 16, 2026",           label: "Family Day" },
  { date: "Mar 16–20, 2026",        label: "Mid-Winter (March) Break" },
  { date: "Apr 3, 2026",            label: "Good Friday" },
  { date: "Apr 6, 2026",            label: "Easter Monday" },
  { date: "May 18, 2026",           label: "Victoria Day" },
  { date: "Jun 15–26, 2026",        label: "Last two full weeks of June" },
];

export function PermitWindowModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="photo-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="permit-window-title"
      onClick={onClose}
    >
      <div className="photo-modal category-modal" onClick={(event) => event.stopPropagation()}>
        <header className="photo-modal-header">
          <div>
            <h3 id="permit-window-title">School-year indoor permit window</h3>
            <p className="meta">2025–26 school year</p>
          </div>
          <button type="button" className="photo-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="photo-modal-body category-modal-body">
          <div>
            <div className="modal-section-label">Permittable window</div>
            <p className="meta category-modal-intro">
              Roughly <strong>Sept 8, 2025 → June 12, 2026</strong>. Permits are not available during
              the first week of school or the last two full weeks of June.
            </p>
          </div>
          <div>
            <div className="modal-section-label">Blackout dates</div>
            <ul className="permit-window-list">
              {BLACKOUTS.map((b) => (
                <li key={b.date}><span>{b.date}</span><span>{b.label}</span></li>
              ))}
            </ul>
          </div>
          <p className="category-modal-source">
            For more info, click{" "}
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">here</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
