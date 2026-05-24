"use client";

import { useEffect, useState } from "react";
import {
  CATEGORY_STORAGE_KEY,
  FEE_CATEGORIES,
  SCHEDULE_ORIENT_STORAGE_KEY,
  type EffectiveScheduleOrient,
  type ScheduleOrient,
} from "@/app/components/fee-ui";
import type { FeeCategory } from "@/lib/fees";

export function usePermitFinderSettings() {
  const [feeCategory, setFeeCategory] = useState<FeeCategory>("B");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [scheduleOrient, setScheduleOrient] = useState<ScheduleOrient>("auto");
  const [autoEffectiveOrient, setAutoEffectiveOrient] = useState<EffectiveScheduleOrient>("times");

  useEffect(() => {
    window.setTimeout(() => {
      const stored = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
      if (stored && (FEE_CATEGORIES as string[]).includes(stored)) {
        setFeeCategory(stored as FeeCategory);
      } else {
        setCategoryModalOpen(true);
      }
      const storedOrient = window.localStorage.getItem(SCHEDULE_ORIENT_STORAGE_KEY);
      if (storedOrient === "days" || storedOrient === "times") setScheduleOrient(storedOrient);
    }, 0);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setAutoEffectiveOrient(mq.matches ? "days" : "times");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("schedule-orient-days", scheduleOrient === "days");
    document.body.classList.toggle("schedule-orient-times", scheduleOrient === "times");
  }, [scheduleOrient]);

  useEffect(() => {
    if (!categoryModalOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setCategoryModalOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [categoryModalOpen]);

  const effectiveScheduleOrient: EffectiveScheduleOrient = scheduleOrient === "auto" ? autoEffectiveOrient : scheduleOrient;

  function selectFeeCategory(next: FeeCategory) {
    setFeeCategory(next);
    window.localStorage.setItem(CATEGORY_STORAGE_KEY, next);
    setCategoryModalOpen(false);
  }

  function selectScheduleOrient(next: EffectiveScheduleOrient) {
    setScheduleOrient(next);
    window.localStorage.setItem(SCHEDULE_ORIENT_STORAGE_KEY, next);
  }

  return {
    feeCategory,
    categoryModalOpen,
    setCategoryModalOpen,
    effectiveScheduleOrient,
    selectFeeCategory,
    selectScheduleOrient,
  };
}
