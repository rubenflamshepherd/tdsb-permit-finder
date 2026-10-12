import { NextResponse } from "next/server";
import { facilityPictureUrls } from "@/lib/pictures";
import { getPrisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spaceId = Number(id);
  if (!Number.isInteger(spaceId) || spaceId <= 0) {
    return NextResponse.json({ error: "Invalid space id" }, { status: 400 });
  }
  const prisma = await getPrisma();
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { pictureFilenames: true } });
  return NextResponse.json({ pictureUrls: facilityPictureUrls(space?.pictureFilenames) });
}
