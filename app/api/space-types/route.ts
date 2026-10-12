import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  const prisma = await getPrisma();
  return NextResponse.json(await prisma.spaceType.findMany({ orderBy: { name: "asc" } }));
}
