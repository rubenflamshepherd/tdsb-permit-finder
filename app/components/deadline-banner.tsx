"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { nextDeadline, type Deadline } from "@/lib/deadlines";

const STORAGE_PREFIX = "deadline-banner-dismissed:";
const BANNER_CHANGE_EVENT = "deadline-banner-changed";

function storageKeyFor(deadline: Deadline): string {
  return `${STORAGE_PREFIX}${deadline.kind}:${deadline.occursAt.getFullYear()}`;
}

export function isDeadlineBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(storageKeyFor(nextDeadline(new Date()))) === "true";
}

export function restoreDeadlineBanner(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKeyFor(nextDeadline(new Date())));
  window.dispatchEvent(new Event(BANNER_CHANGE_EVENT));
}

export function DeadlineBanner() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  const deadline = useMemo(() => nextDeadline(new Date()), []);
  const storageKey = storageKeyFor(deadline);

  useEffect(() => {
    const sync = () => setDismissed(localStorage.getItem(storageKey) === "true");
    sync();
    setMounted(true);
    window.addEventListener(BANNER_CHANGE_EVENT, sync);
    return () => window.removeEventListener(BANNER_CHANGE_EVENT, sync);
  }, [storageKey]);

  useEffect(() => {
    const el = bannerRef.current;
    if (!el) {
      document.body.style.removeProperty("--banner-height");
      return;
    }
    const update = () => {
      document.body.style.setProperty("--banner-height", `${el.offsetHeight}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted, dismissed]);

  if (!mounted || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, "true");
    setDismissed(true);
    window.dispatchEvent(new Event(BANNER_CHANGE_EVENT));
  };

  return (
    <div ref={bannerRef} className="deadline-banner" role="region" aria-label="Next permit application deadline">
      <div className="deadline-banner-inner">
        <p>
          <strong>From TDSB:</strong> The deadline date that you can submit permit applications for
          bulk processing is <strong>{deadline.label}</strong> for {deadline.description}. For more
          info{" "}
          <a
            href="https://www.tdsb.on.ca/Community/Permits/Frequently-Asked-Questions"
            target="_blank"
            rel="noopener noreferrer"
            className="deadline-banner-source"
          >
            click here
          </a>
          .
        </p>
        <button type="button" className="deadline-banner-dismiss" onClick={dismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
