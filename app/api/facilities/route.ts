import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TdsbClient } from "@/lib/tdsb-client";

export async function GET() {
  try {
    const rows = await prisma.facility.findMany({ orderBy: { name: "asc" }, take: 1000 });
    if (rows.length) return NextResponse.json(rows);
  } catch {}
  return NextResponse.json(await new TdsbClient().facilities());
}
