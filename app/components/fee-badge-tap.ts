// On touch, Radix's Tooltip.Trigger fires focus AND click in the same React event batch.
// Focus calls onOpenChange(true); a toggle (`(o) => !o`) would read the pending `true` and
// return `false`, leaving the tooltip closed on first tap. Always request open; the outside-
// pointerdown listener in FeeBadge handles closing.
export function handleFeeBadgeTap(setOpen: (open: boolean) => void) {
  setOpen(true);
}
