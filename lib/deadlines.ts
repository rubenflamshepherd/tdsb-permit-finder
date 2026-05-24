export type DeadlineKind = "outdoor-field" | "summer-indoor" | "school-year-indoor";

export type Deadline = {
  kind: DeadlineKind;
  occursAt: Date;
  label: string;
  description: string;
};

const SCHEDULE: Array<{ kind: DeadlineKind; month: number; day: number; label: string; description: string }> = [
  { kind: "outdoor-field",      month: 1, day: 31, label: "January 31", description: "outdoor field permits" },
  { kind: "summer-indoor",      month: 3, day: 1,  label: "March 1",    description: "summer indoor permits" },
  { kind: "school-year-indoor", month: 6, day: 1,  label: "June 1",     description: "school year indoor permits" },
];

export function nextDeadline(now: Date): Deadline {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcoming = SCHEDULE.map((d) => {
    const thisYear = new Date(today.getFullYear(), d.month - 1, d.day);
    const occursAt = thisYear.getTime() >= today.getTime()
      ? thisYear
      : new Date(today.getFullYear() + 1, d.month - 1, d.day);
    return { kind: d.kind, occursAt, label: d.label, description: d.description };
  });

  upcoming.sort((a, b) => a.occursAt.getTime() - b.occursAt.getTime());
  return upcoming[0];
}
