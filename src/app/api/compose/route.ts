import { getEnv } from "@/lib/env";
import { composeReadiness, getProfile } from "@/lib/profile";
import { getScript, saveScript } from "@/lib/repo";
import { composeScript } from "@/lib/composer";
import { refineScript } from "@/lib/llm";
import { json, readJsonBody } from "@/lib/http";
import type { ComposedScript, Lead, ObjectiveId } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ComposeBody {
  lead?: Partial<Lead>;
  objective?: ObjectiveId;
  useLlm?: boolean;
  /** Reuse an already-composed script rather than recomposing. */
  scriptId?: string;
}

const OBJECTIVES: ObjectiveId[] = [
  "book_meeting",
  "book_demo",
  "qualify",
  "reactivate",
  "send_info",
  "event_invite",
];

export async function POST(req: Request): Promise<Response> {
  const body = await readJsonBody<ComposeBody>(req);
  if (!body) return json({ ok: false, error: "Malformed JSON body." }, 400);

  if (body.scriptId && !body.lead) {
    const existing = await getScript(body.scriptId);
    if (!existing) return json({ ok: false, error: "Script not found." }, 404);
    return json({ ok: true, script: existing, refined: existing.generatedBy === "llm" });
  }

  const lead: Lead = {
    name: body.lead?.name?.trim() || "there",
    role: body.lead?.role?.trim() ?? "",
    company: body.lead?.company?.trim() ?? "",
    industry: body.lead?.industry?.trim() ?? "",
    need: body.lead?.need?.trim() || "whether they need a website for their business",
    trigger: body.lead?.trigger?.trim() || undefined,
    city: body.lead?.city?.trim() || undefined,
    timezone: body.lead?.timezone?.trim() || undefined,
    phone: body.lead?.phone?.trim() || undefined,
    notes: body.lead?.notes?.trim() || undefined,
  };

  const objective: ObjectiveId =
    body.objective && OBJECTIVES.includes(body.objective) ? body.objective : "book_meeting";

  const profile = await getProfile();
  const env = getEnv();

  // A specific call needs a specific offer. Guessing here would put invented
  // claims about the operator's business into a real prospect's ear.
  const readiness = composeReadiness(profile);
  if (!readiness.ok) {
    return json({ ok: false, error: readiness.detail, missing: readiness.missing, readiness }, 409);
  }

  let script: ComposedScript = composeScript(profile, lead, objective);
  let refined = false;

  if (body.useLlm !== false) {
    const result = await refineScript(env, profile, script);
    if (result) {
      script = result.script;
      refined = true;
    }
  }

  await saveScript(script);
  return json({ ok: true, script, refined });
}
