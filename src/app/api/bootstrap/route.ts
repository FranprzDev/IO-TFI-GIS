import { NextResponse } from "next/server";
import { loadDatasets } from "@/lib/data/csv";

export async function GET() {
  const data = await loadDatasets();
  return NextResponse.json(data);
}
