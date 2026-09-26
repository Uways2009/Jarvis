import { getEnv, resolveBaseUrl } from "@/lib/env";
import { getProfile } from "@/lib/profile";
import { composeScript } from "@/lib/composer";
import { openingLine } from "@/lib/dialogue";
import { evaluateDispatch, LIVE_CONFIRMATION_PHRASE, type Verdict } from "@/lib/safety";
import { createCall } from "@/lib/twilio";
import { getClip, getScript, listCalls, newCallRecord, saveScript, updateCall } from "@/lib/repo";
import { json, readJsonBody, serverError } from "@/lib/http";
import type { CallMode, CallRecord, CallStatus, Lead, ObjectiveId } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DispatchBody {
  to?: string;
  mode?: CallMode;
  confirmPhrase?: string;
  record?: boolean;
  region?: string;
  machineDetection?: "Enable" | "DetectMessageEnd";
  lead?: Partial<Lead>;
  objective?: ObjectiveId;
  scriptId?: string;
  clipId?: string;
}

function mapTwilioStatus(status: string | undefined): CallStatus {
  switch ((status ?? "").toLowerCase()) {
    case "queued":
      return "queued";
    case "initiated":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in-progress";
    case "completed":
      return "completed";
    case "busy":
      return "busy";
    case "no-answer":
      return "no-answer";
    case "canceled":
      return "canceled";
    case "failed":
      return "failed";
    default:
      return "queued";
  }
}

export async function GET(): Promise<Response> {
  const [calls, env] = await Promise.all([listCalls(), Promise.resolve(getEnv())]);
  return json({ ok: true, calls, armed: env.liveCallsArmed, confirmPhrase: LIVE_CONFIRMATION_PHRASE });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJsonBody<DispatchBody>(req);
    if (!body?.to) return json({ ok: false, error: "A destination number is required." }, 400);

    const env = getEnv();
    const profile = await getProfile();
    const calls = await listCalls();

    const lead: Lead | undefined = body.lead?.name
      ? {
          name: body.lead.name ?? "",
          role: body.lead.role ?? "",
          company: body.lead.company ?? "",
          industry: body.lead.industry ?? "",
          need: body.lead.need ?? "",
          trigger: body.lead.trigger,
          city: body.lead.city,
          timezone: body.lead.timezone,
          phone: body.lead.phone,
          notes: body.lead.notes,
        }
      : undefined;

    const objective: ObjectiveId = body.objective ?? "book_meeting";
    const requestedMode: CallMode = body.mode === "live" ? "live" : "dry_run";

    const verdict: Verdict = await evaluateDispatch(
      {
        to: body.to,
        mode: requestedMode,
        confirmPhrase: body.confirmPhrase,
        record: body.record,
        lead,
        objective,
        region: body.region,
      },
      profile,
      calls,
      env,
    );

    // The script is the payload of the call — composed once, reused on every turn.
    const script = body.scriptId
      ? await getScript(body.scriptId)
      : composeScript(profile, lead ?? {
          name: "there",
          role: "",
          company: "",
          industry: "",
          need: profile.company.oneLiner,
        }, objective);

    const clip = body.clipId ? await getClip(body.clipId) : null;

    if (!verdict.allowed) {
      const blocked = await newCallRecord({
        to: verdict.normalizedTo || body.to,
        from: env.twilio.fromNumber,
        mode: requestedMode,
        status: "failed",
        lead,
        objective,
        scriptId: script?.id,
        clipId: clip?.id,
        blockedReason: verdict.blockers.join(" "),
        events: [
          { at: new Date().toISOString(), status: "blocked", detail: verdict.blockers.join(" | ") },
        ],
      });
      return json({ ok: false, blocked: true, verdict, record: blocked, script }, 400);
    }

    const greeting = openingLine({ profile, lead, script: script ?? undefined, turn: 0, objective });
    const voicemail = script?.voicemail ?? `${profile.company.name} — ${profile.company.oneLiner}`;

    /* ── Dry run: full rehearsal, zero dialling ─────────────────────────── */
    if (verdict.mode === "dry_run") {
      const record = await newCallRecord({
        to: verdict.normalizedTo,
        from: env.twilio.fromNumber || "(not configured)",
        mode: "dry_run",
        status: "dry_run",
        lead,
        objective,
        scriptId: script?.id,
        clipId: clip?.id,
        transcript: [
          { at: new Date().toISOString(), speaker: "system", text: "DRY RUN — nothing was dialled." },
          { at: new Date().toISOString(), speaker: "assistant", text: greeting },
          ...(clip
            ? [
                {
                  at: new Date().toISOString(),
                  speaker: "assistant" as const,
                  text: `[voice clip] ${clip.label || clip.text.slice(0, 90)}`,
                },
              ]
            : []),
        ],
        events: [
          { at: new Date().toISOString(), status: "dry_run", detail: "Rehearsal only — no carrier leg." },
        ],
      });
      return json({ ok: true, verdict, record, script, greeting, voicemail });
    }

    /* ── Live: create the record first so the webhook can find it ───────── */
    const record = await newCallRecord({
      to: verdict.normalizedTo,
      from: env.twilio.fromNumber,
      mode: "live",
      status: "queued",
      lead,
      objective,
      scriptId: script?.id,
      clipId: clip?.id,
      events: [{ at: new Date().toISOString(), status: "queued", detail: "Handing to Twilio." }],
    });

    const base = resolveBaseUrl(req, env);
    const voiceUrl = `${base}/api/twilio/voice?callId=${encodeURIComponent(record.id)}`;
    const statusCallback = `${base}/api/twilio/status?callId=${encodeURIComponent(record.id)}`;

    const result = await createCall(env, {
      to: verdict.normalizedTo,
      from: env.twilio.fromNumber,
      url: voiceUrl,
      statusCallback,
      recordingCallback: statusCallback,
      record: Boolean(body.record),
      machineDetection: body.machineDetection ?? (clip ? "DetectMessageEnd" : "Enable"),
      ringTimeoutSeconds: 22,
    });

    if (!result.ok || !result.data?.sid) {
      const failed = await updateCall(record.id, {
        status: "failed",
        blockedReason: result.error ?? "Twilio rejected the call.",
        events: [
          ...record.events,
          {
            at: new Date().toISOString(),
            status: "failed",
            detail: result.error ?? "Twilio rejected the call.",
          },
        ],
      });
      return json(
        { ok: false, error: result.error ?? "Twilio rejected the call.", record: failed, verdict },
        502,
      );
    }

    const updated = await updateCall(record.id, {
      sid: result.data.sid,
      status: mapTwilioStatus(result.data.status as string | undefined),
      telephonyStatus: result.data.status as string | undefined,
      events: [
        ...record.events,
        {
          at: new Date().toISOString(),
          status: "dispatched",
          detail: `Twilio SID ${result.data.sid}`,
        },
      ],
    });

    return json({ ok: true, verdict, record: updated, script, greeting, voicemail });
  } catch (error) {
    return serverError(error);
  }
}
