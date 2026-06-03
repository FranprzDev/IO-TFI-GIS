import { runSimulationAsync } from "@/lib/sim/engine";
import { validateScenario } from "@/lib/validation/scenario";
import { isWithinTucumanBounds } from "@/lib/geo/tucuman";
import type { ScenarioInput } from "@/types/simulation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const raw = (await req.json()) as ScenarioInput;
  const body: ScenarioInput = {
    ...raw,
    demandZones: (raw.demandZones ?? []).filter((zone) => isWithinTucumanBounds(zone.lat, zone.lon)),
  };
  const errors = validateScenario(body);
  if (errors.length > 0) {
    return new Response(JSON.stringify({ ok: false, errors }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const totalWork = Math.max(1, body.global.horizonDays);
  let lastReportedPct = -1;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const result = await runSimulationAsync(body, ({ day }) => {
          const pct = Math.floor((day / totalWork) * 100);
          if (pct > lastReportedPct) {
            lastReportedPct = pct;
            send("progress", { day, pct });
          }
        });

        send("result", { ok: true, result });
      } catch (err) {
        send("error", { ok: false, message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
