import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { TdsbClient } from "@/lib/tdsb-client";

export async function GET() {
  try {
    const prisma = await getPrisma();
    const rows = await prisma.spaceType.findMany({ orderBy: { name: "asc" } });
    if (rows.length) return NextResponse.json(rows);
  } catch {}
  return NextResponse.json(await new TdsbClient().spaceTypes());
}
