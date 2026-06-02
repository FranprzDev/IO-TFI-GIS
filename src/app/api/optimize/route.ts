import { runOptimization } from "@/lib/optimize/engine";
import type { OptimizationRequest } from "@/types/simulation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as OptimizationRequest;

  const siteSpan = Math.max(1, body.maxSites - body.minSites + 1);
  const stageWeights = {
    greedy: 0.55,
    swap: 0.35,
    finalize: 0.10,
  } as const;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      let lastReportedPct = -1;
      try {
        const result = await runOptimization(body, (progress) => {
          const stageOffset = progress.stage === "greedy"
            ? 0
            : progress.stage === "swap"
              ? stageWeights.greedy
              : stageWeights.greedy + stageWeights.swap;
          const stageFraction = progress.completed / Math.max(1, progress.total);
          const perSiteFraction = stageOffset + (stageFraction * stageWeights[progress.stage]);
          const siteIndex = progress.siteCount - body.minSites;
          const absoluteFraction = (siteIndex + perSiteFraction) / siteSpan;
          const pct = Math.floor(Math.min(100, Math.max(0, absoluteFraction * 100)));
          // Throttle: only emit when the integer percentage actually advances,
          // so thousands of evaluations don't enqueue thousands of SSE chunks.
          if (pct > lastReportedPct) {
            lastReportedPct = pct;
            send("progress", { stage: progress.stage, siteCount: progress.siteCount, pct });
          }
        });

        send("result", { ok: true, result });
      } catch (error) {
        send("error", { ok: false, message: String(error) });
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
