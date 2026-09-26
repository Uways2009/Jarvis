import { getEnv } from "@/lib/env";
import { getProfile } from "@/lib/profile";
import { listCalls } from "@/lib/repo";
import { evaluateDispatch } from "@/lib/safety";
import { json, readJsonBody } from "@/lib/http";
import type { CallMode, Lead, ObjectiveId } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PreflightBody {
  to?: string;
  mode?: CallMode;
  confirmPhrase?: string;
  record?: boolean;
  region?: string;
  lead?: Partial<Lead>;
  objective?: ObjectiveId;
}

/**
 * The verdict without the consequence: runs every gate, creates nothing,
 * dials nothing. This is what the operator reads before arming.
 */
export async function POST(req: Request): Promise<Response> {
  const body = await readJsonBody<PreflightBody>(req);
  if (!body?.to) return json({ ok: false, error: "A destination number is required." }, 400);

  const env = getEnv();
  const profile = await getProfile();
  const calls = await listCalls();

  const verdict = await evaluateDispatch(
    {
      to: body.to,
      mode: body.mode === "live" ? "live" : "dry_run",
      confirmPhrase: body.confirmPhrase,
      record: body.record,
      region: body.region,
      lead: body.lead?.name
        ? {
            name: body.lead.name,
            role: body.lead.role ?? "",
            company: body.lead.company ?? "",
            industry: body.lead.industry ?? "",
            need: body.lead.need ?? "",
            timezone: body.lead.timezone,
            trigger: body.lead.trigger,
            phone: body.lead.phone,
          }
        : undefined,
      objective: body.objective ?? "book_meeting",
    },
    profile,
    calls,
    env,
  );

  return json({ ok: true, verdict });
}
