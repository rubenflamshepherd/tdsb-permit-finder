// TDSB Facility Permit Fees, effective September 1, 2025 – August 31, 2026.
// Source: https://www.tdsb.on.ca/Portals/0/community/Permits/G02%20Fees%202025-2026.pdf
// Rates are hourly, before HST. Refresh annually when TDSB publishes the next schedule.

export type FeeCategory = "A1" | "A2" | "B" | "C";

export type TimeOfUse =
  | "school-day"     // Mon-Fri school year, 6pm-10pm
  | "school-break"   // Mon-Fri summer/breaks, 8am-5pm
  | "saturday"       // 8am-6pm
  | "sunday-holiday" // 8am-3pm
  | "outdoor";       // outdoor fields — single rate, time-of-use ignored

export const CATEGORY_LABELS: Record<FeeCategory, string> = {
  A1: "(A1) Youth, Seniors & Marginalized Groups — highest subsidy",
  A2: "(A2) Other not-for-profit — partial subsidy",
  B: "(B) Cost Recovery",
  C: "(C) Private / Commercial",
};

type Row = Record<FeeCategory, number>;

const INDOOR: Record<string, Record<Exclude<TimeOfUse, "outdoor">, Row>> = {
  classroom: {
    "school-day":     { A1: 3.74,  A2: 7.63,   B: 9.32,   C: 27.23 },
    "school-break":   { A1: 3.74,  A2: 7.63,   B: 9.32,   C: 27.23 },
    "saturday":       { A1: 10.59, A2: 21.67,  B: 26.41,  C: 40.88 },
    "sunday-holiday": { A1: 14.30, A2: 29.29,  B: 35.72,  C: 49.05 },
  },
  "cafeteria-small": {
    "school-day":     { A1: 26.14, A2: 53.51,  B: 65.24,  C: 190.68 },
    "school-break":   { A1: 26.14, A2: 53.51,  B: 65.24,  C: 196.13 },
    "saturday":       { A1: 42.27, A2: 86.62,  B: 105.66, C: 217.91 },
    "sunday-holiday": { A1: 54.09, A2: 110.84, B: 135.19, C: 228.81 },
  },
  "cafeteria-large": {
    "school-day":     { A1: 50.36, A2: 103.22, B: 125.85, C: 309.67 },
    "school-break":   { A1: 50.36, A2: 103.22, B: 125.85, C: 309.67 },
    "saturday":       { A1: 60.89, A2: 124.88, B: 152.26, C: 359.56 },
    "sunday-holiday": { A1: 72.72, A2: 149.08, B: 181.81, C: 370.49 },
  },
  "gym-single": {
    "school-day":     { A1: 12.43, A2: 25.48,  B: 31.08,  C: 53.11 },
    "school-break":   { A1: 12.43, A2: 25.48,  B: 31.08,  C: 55.87 },
    "saturday":       { A1: 18.63, A2: 38.20,  B: 46.62,  C: 65.37 },
    "sunday-holiday": { A1: 42.89, A2: 87.90,  B: 107.19, C: 128.66 },
  },
  "gym-double": {
    "school-day":     { A1: 24.86, A2: 50.99,  B: 62.15,  C: 106.26 },
    "school-break":   { A1: 24.86, A2: 50.99,  B: 62.15,  C: 111.69 },
    "saturday":       { A1: 37.30, A2: 76.43,  B: 93.22,  C: 130.74 },
    "sunday-holiday": { A1: 60.89, A2: 124.88, B: 152.26, C: 182.73 },
  },
  "auditorium-small": {
    "school-day":     { A1: 22.38, A2: 45.87,  B: 55.93,  C: 321.43 },
    "school-break":   { A1: 22.38, A2: 45.87,  B: 55.93,  C: 326.89 },
    "saturday":       { A1: 34.19, A2: 70.09,  B: 85.45,  C: 348.68 },
    "sunday-holiday": { A1: 47.24, A2: 96.83,  B: 118.09, C: 359.56 },
  },
  "auditorium-large": {
    "school-day":     { A1: 42.27, A2: 86.62,  B: 105.66, C: 642.83 },
    "school-break":   { A1: 42.27, A2: 86.62,  B: 105.66, C: 648.31 },
    "saturday":       { A1: 49.70, A2: 101.92, B: 124.29, C: 670.08 },
    "sunday-holiday": { A1: 63.99, A2: 131.24, B: 160.04, C: 680.97 },
  },
  specialty: {
    "school-day":     { A1: 7.47,  A2: 15.33,  B: 18.63,  C: 54.48 },
    "school-break":   { A1: 7.47,  A2: 15.33,  B: 18.63,  C: 54.48 },
    "saturday":       { A1: 20.50, A2: 42.05,  B: 51.27,  C: 81.70 },
    "sunday-holiday": { A1: 27.97, A2: 57.34,  B: 69.92,  C: 98.05 },
  },
};

const OUTDOOR: Record<string, Row> = {
  "ball-diamond":  { A1: 3.11,   A2: 6.38,   B: 7.75,   C: 32.70 },
  field:           { A1: 10.59,  A2: 21.67,  B: 26.41,  C: 95.33 },
  "turf-small":    { A1: 22.38,  A2: 45.87,  B: 55.93,  C: 108.96 },
  "turf-medium":   { A1: 44.75,  A2: 91.72,  B: 111.88, C: 134.26 },
  "turf-premium":  { A1: 223.76, A2: 223.76, B: 223.76, C: 268.52 },
};

// API space_type id → fee table row. Lunch Room (21), Track (48), and Pool space
// types are intentionally absent: the published schedule does not list them or
// requires a separate process. 47 (Playground/Ball courts/Asphalt) shares the
// "Ball Diamond/Court" row because the fee table groups diamonds and courts.
const SPACE_TYPE_TO_ROW: Record<number, { kind: "indoor"; row: keyof typeof INDOOR } | { kind: "outdoor"; row: keyof typeof OUTDOOR }> = {
  2:  { kind: "indoor",  row: "auditorium-large" },
  3:  { kind: "indoor",  row: "cafeteria-small" },
  17: { kind: "indoor",  row: "gym-double" },
  18: { kind: "indoor",  row: "gym-single" },
  29: { kind: "indoor",  row: "classroom" },
  30: { kind: "indoor",  row: "specialty" },
  42: { kind: "indoor",  row: "auditorium-small" },
  43: { kind: "indoor",  row: "cafeteria-large" },
  11: { kind: "outdoor", row: "turf-medium" },
  12: { kind: "outdoor", row: "ball-diamond" },
  13: { kind: "outdoor", row: "field" },
  37: { kind: "outdoor", row: "turf-small" },
  44: { kind: "outdoor", row: "turf-premium" },
  47: { kind: "outdoor", row: "ball-diamond" },
};

export function getFee(spaceTypeId: number, category: FeeCategory, timeOfUse: TimeOfUse): number | null {
  const mapping = SPACE_TYPE_TO_ROW[spaceTypeId];
  if (!mapping) return null;
  if (mapping.kind === "outdoor") return OUTDOOR[mapping.row][category];
  if (timeOfUse === "outdoor") return null;
  return INDOOR[mapping.row][timeOfUse][category];
}

// Pick a representative indoor time-of-use bucket from a weekday selection
// (1=Mon..7=Sun). Weekday-eve dominates when any weekday is included; Sunday
// wins over Saturday when both are picked because the Sun/holiday rate is
// significantly higher and we'd rather over-quote than under-quote.
export function pickTimeOfUse(weekdays: number[]): Exclude<TimeOfUse, "outdoor" | "school-break"> {
  if (weekdays.some((d) => d >= 1 && d <= 5)) return "school-day";
  if (weekdays.includes(7)) return "sunday-holiday";
  if (weekdays.includes(6)) return "saturday";
  return "school-day";
}

export const PROCESSING_FEES = {
  application: 35,
  amendmentOrCancellation: 25,
  dishonouredPayment: 50,
} as const;

export const CARETAKING_HOURLY = {
  sundayOrHoliday: 74.46,
  otherTimes: 55.39,
} as const;
