import { describe, expect, it, vi } from "vitest";
import { handleFeeBadgeTap } from "../app/components/fee-badge-tap";

describe("handleFeeBadgeTap", () => {
  it("always requests open=true, never a functional updater", () => {
    const setOpen = vi.fn();
    handleFeeBadgeTap(setOpen);
    expect(setOpen).toHaveBeenCalledTimes(1);
    expect(setOpen).toHaveBeenCalledWith(true);
    // A functional updater (e.g. `(o) => !o`) would let Radix's focus → click race close
    // the tooltip on first tap, since both updates batch and the toggle reads the pending
    // `true` from focus and returns `false`. Guard against that regression.
    const args = setOpen.mock.calls.map((call) => call[0]);
    expect(args.some((arg) => typeof arg === "function")).toBe(false);
  });

  it("is idempotent when the tooltip is already open", () => {
    const setOpen = vi.fn();
    handleFeeBadgeTap(setOpen);
    handleFeeBadgeTap(setOpen);
    expect(setOpen).toHaveBeenCalledTimes(2);
    expect(setOpen).toHaveBeenNthCalledWith(1, true);
    expect(setOpen).toHaveBeenNthCalledWith(2, true);
  });
});
