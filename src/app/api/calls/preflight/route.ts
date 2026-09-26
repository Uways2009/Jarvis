import { validateDispatchBody } from "@/lib/dispatch-input";
import { getEnv } from "@/lib/env";
import { composeReadiness, getProfile } from "@/lib/profile";
import { getScript, getClip, listCalls } from "@/lib/repo";
import { evaluateDispatch } from "@/lib/safety";
import { json, readJsonBody, serverError } from "@/lib/http";
import type { CallMode, Lead, ObjectiveId } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PreflightBody {
  to?: string;
  scriptId?: string;
  clipId?: string;
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
  try {
    const body = await readJsonBody<PreflightBody>(req);
    const inputError = validateDispatchBody(body);
    if (inputError || !body || typeof body.to !== "string") return json({ ok: false, error: inputError }, 400);

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
        lead: body.lead
          ? {
              name: body.lead.name || "there",
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

    const readiness = composeReadiness(profile);
    const payloadError = body.scriptId
      ? !(await getScript(body.scriptId)) ? "The selected script no longer exists. Select another script." : null
      : !readiness.ok ? readiness.detail : null;
    const clipError = body.clipId && !(await getClip(body.clipId))
      ? "The selected voice clip no longer exists. Select another clip." : null;
    for (const error of [payloadError, clipError]) {
      if (error) {
        verdict.allowed = false;
        verdict.blockers.push(error);
        verdict.checks.push({ label: "Call content ready", ok: false, detail: error });
      }
    }
    return json({ ok: true, verdict });
  } catch (error) {
    return serverError(error);
  }
}
