"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { nextDeadline, type Deadline } from "@/lib/deadlines";

const STORAGE_PREFIX = "deadline-banner-dismissed:";
const BANNER_CHANGE_EVENT = "deadline-banner-changed";

function storageKeyFor(deadline: Deadline): string {
  return `${STORAGE_PREFIX}${deadline.kind}:${deadline.occursAt.getFullYear()}`;
}

function subscribeDeadlineBanner(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(BANNER_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(BANNER_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function isStorageKeyDismissed(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(storageKey) === "true";
}

export function isDeadlineBannerDismissed(): boolean {
  return isStorageKeyDismissed(storageKeyFor(nextDeadline(new Date())));
}

export function restoreDeadlineBanner(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKeyFor(nextDeadline(new Date())));
  window.dispatchEvent(new Event(BANNER_CHANGE_EVENT));
}

export function DeadlineBanner() {
  const bannerRef = useRef<HTMLDivElement>(null);

  const deadline = useMemo(() => nextDeadline(new Date()), []);
  const storageKey = storageKeyFor(deadline);
  const dismissed = useSyncExternalStore(
    subscribeDeadlineBanner,
    () => isStorageKeyDismissed(storageKey),
    () => true,
  );

  useEffect(() => {
    const el = bannerRef.current;
    if (!el) {
      document.body.style.removeProperty("--banner-height");
      return;
    }
    let rafId: number | null = null;
    const update = () => {
      rafId = null;
      const visible = Math.max(0, el.getBoundingClientRect().bottom);
      document.body.style.setProperty("--banner-height", `${visible}px`);
    };
    const schedule = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [dismissed]);

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, "true");
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
