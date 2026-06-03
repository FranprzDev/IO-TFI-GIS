import { runOptimization } from "@/lib/optimize/engine";
import type { OptimizationRequest } from "@/types/simulation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as OptimizationRequest;
  const log = (...args: unknown[]) => console.log("[optimize]", ...args);
  const normalizedBody: OptimizationRequest = {
    ...body,
    minSites: Math.min(body.minSites, body.kiosks.length),
    maxSites: body.kiosks.length,
  };

  const siteSpan = Math.max(1, normalizedBody.maxSites - normalizedBody.minSites + 1);
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

      log("request received", {
        minSites: normalizedBody.minSites,
        maxSites: normalizedBody.maxSites,
        kiosks: body.kiosks.length,
        demandZones: body.demandZones.length,
      });
      let lastReportedPct = -1;
      let lastStage: string | null = null;
      let lastSiteCount: number | null = null;
      try {
        send("status", { message: "Preparando busqueda de optimizacion..." });
        log("status", "Preparando busqueda de optimizacion...");
        await new Promise<void>((resolve) => setImmediate(resolve));

        const result = await runOptimization(normalizedBody, (progress) => {
          if (progress.stage !== lastStage || progress.siteCount !== lastSiteCount) {
            log("stage", {
              stage: progress.stage,
              siteCount: progress.siteCount,
              completed: progress.completed,
              total: progress.total,
            });
            lastStage = progress.stage;
            lastSiteCount = progress.siteCount;
          }

          const stageOffset = progress.stage === "greedy"
            ? 0
            : progress.stage === "swap"
              ? stageWeights.greedy
              : stageWeights.greedy + stageWeights.swap;
          const stageFraction = progress.completed / Math.max(1, progress.total);
          const perSiteFraction = stageOffset + (stageFraction * stageWeights[progress.stage]);
          const siteIndex = progress.siteCount - normalizedBody.minSites;
          const absoluteFraction = (siteIndex + perSiteFraction) / siteSpan;
          const pct = Math.floor(Math.min(100, Math.max(0, absoluteFraction * 100)));
          // Throttle: only emit when the integer percentage actually advances,
          // so thousands of evaluations don't enqueue thousands of SSE chunks.
          if (pct > lastReportedPct) {
            lastReportedPct = pct;
            send("progress", { stage: progress.stage, siteCount: progress.siteCount, pct });
            if (pct === 0 || pct % 25 === 0 || pct === 100) {
              log("progress", { stage: progress.stage, siteCount: progress.siteCount, pct });
            }
          }
        });

        log("result", {
          bestScore: result.best.score,
          bestSites: result.best.selectedKioskIds.length,
          scenarios: result.topScenarios.length,
        });
        send("result", { ok: true, result });
      } catch (error) {
        log("error", String(error));
        send("error", { ok: false, message: String(error) });
      } finally {
        log("stream closed");
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
