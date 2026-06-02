import { runOptimization } from "@/lib/optimize/engine";
import type { OptimizationRequest } from "@/types/simulation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as OptimizationRequest;

  const totalSteps = Math.max(1, body.maxSites - body.minSites + 1);

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const result = runOptimization(body, (progress) => {
          const siteProgress = (progress.siteCount - body.minSites) + (progress.completed / Math.max(1, progress.total));
          const pct = Math.floor((siteProgress / totalSteps) * 100);
          send("progress", { ...progress, pct });
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
