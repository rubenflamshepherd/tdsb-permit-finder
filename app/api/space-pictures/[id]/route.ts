import { NextResponse } from "next/server";
import { facilityPictureUrls } from "@/lib/pictures";
import { TdsbClient } from "@/lib/tdsb-client";

const TTL_MS = 1000 * 60 * 60;
const cache = new Map<number, { urls: string[]; expiresAt: number }>();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spaceId = Number(id);
  if (!Number.isInteger(spaceId) || spaceId <= 0) {
    return NextResponse.json({ error: "Invalid space id" }, { status: 400 });
  }
  const now = Date.now();
  const cached = cache.get(spaceId);
  if (cached && cached.expiresAt > now) return NextResponse.json({ pictureUrls: cached.urls });

  try {
    const filenames = await new TdsbClient().spacePictures(spaceId);
    const pictureUrls = facilityPictureUrls(filenames);
    cache.set(spaceId, { urls: pictureUrls, expiresAt: now + TTL_MS });
    return NextResponse.json({ pictureUrls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch space pictures";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
