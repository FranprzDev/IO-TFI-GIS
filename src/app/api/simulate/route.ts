import { NextResponse } from "next/server";
import { runSimulation } from "@/lib/sim/engine";
import { validateScenario } from "@/lib/validation/scenario";
import type { ScenarioInput } from "@/types/simulation";

export async function POST(req: Request) {
  const body = (await req.json()) as ScenarioInput;
  const errors = validateScenario(body);
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const result = runSimulation(body);
  return NextResponse.json({ ok: true, result });
}
