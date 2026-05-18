import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse("facility,space,date,start,end\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=tdsb-spaces.csv" },
  });
}
