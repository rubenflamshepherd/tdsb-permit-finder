import { sendGAEvent } from "@next/third-parties/google";

export type EventName =
  | "search_initiated"
  | "space_type_selected"
  | "photo_gallery_opened"
  | "permit_window_opened";

export type EventParams = Record<string, string | number | boolean>;

export function trackEvent(name: EventName, params?: EventParams) {
  if (!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) return;
  sendGAEvent("event", name, params ?? {});
}
