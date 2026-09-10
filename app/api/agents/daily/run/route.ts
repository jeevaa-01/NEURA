import { runDueDailyAgents } from "@/features/daily-agents/service";
import { serverEnv } from "@/lib/validations/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = request.headers.get("x-neura-scheduler-token");
  const expected = serverEnv().BETTER_AUTH_SECRET;
  if (!token || token !== expected)
    return Response.json(
      { error: "Scheduler authentication failed." },
      { status: 401 },
    );

  return Response.json(await runDueDailyAgents());
}
