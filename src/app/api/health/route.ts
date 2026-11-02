import { isGuideConfigured } from "@/features/guide/server";
import { json, withApi } from "@/lib/api";
import { pingDatabase } from "@/lib/supabase/health";

/**
 * Liveness: `/api/health` answers from the function alone. Readiness: `/api/health?deep=1` also
 * asks the database one cheap question and answers 503 when it does not reply, for the uptime
 * monitor (docs/deploy.md). The deep answer also says whether the money guide is on for this
 * deployment (flag and key both present), so a missing variable shows up without reading logs.
 */
export const GET = withApi(async (request: Request) => {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  if (!deep) return json({ status: "ok" });
  const database = await pingDatabase();
  return json(
    {
      status: database ? "ok" : "degraded",
      database: database ? "ok" : "unreachable",
      guide: isGuideConfigured() ? "on" : "off",
    },
    { status: database ? 200 : 503 },
  );
});
