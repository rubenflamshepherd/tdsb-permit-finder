import type { NearbySchool } from "@/lib/api-contracts";

export type AvailabilityStatus = "available" | "partial" | "unavailable";

export const statusLabel: Record<AvailabilityStatus, string> = {
  available: "All weeks",
  partial: "Some weeks",
  unavailable: "No weeks",
};

export function getSchoolStatus(school: NearbySchool): AvailabilityStatus {
  const availableWeeks = school.schedule.reduce((sum, slot) => sum + slot.availableWeeks, 0);
  const totalWeeks = school.schedule.reduce((sum, slot) => sum + slot.totalWeeks, 0);
  if (availableWeeks === 0) return "unavailable";
  if (availableWeeks === totalWeeks) return "available";
  return "partial";
}

export function getSchoolSummary(school: NearbySchool) {
  const availableDays = school.schedule.filter((slot) => slot.availableWeeks > 0).length;
  const totalDays = school.schedule.length;
  const openWeeks = school.schedule.reduce((sum, slot) => sum + slot.availableWeeks, 0);
  const totalWeeks = school.schedule.reduce((sum, slot) => sum + slot.totalWeeks, 0);
  return { availableDays, totalDays, openWeeks, totalWeeks };
}
