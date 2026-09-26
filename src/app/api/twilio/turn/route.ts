import { getEnv, resolveBaseUrl } from "@/lib/env";
import { getProfile } from "@/lib/profile";
import { appendTranscript, getCall, getScript, updateCall } from "@/lib/repo";
import { MAX_TURNS, respond } from "@/lib/dialogue";
import { buildTurnTwiml, reconstructUrl, validateTwilioSignature } from "@/lib/twilio";
import { addSuppression } from "@/lib/safety";
import { readForm, twiml } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * One turn of the conversation. Twilio posts the recognised speech here after
 * each `<Gather>`, and we answer with the next line and either another listen
 * window, a warm transfer, or a courteous exit.
 */
export async function POST(req: Request): Promise<Response> {
  const env = getEnv();
  const base = resolveBaseUrl(req, env);
  const url = new URL(req.url);
  const params = await readForm(req);

  const callId = url.searchParams.get("callId") ?? "";
  const turn = Number.parseInt(url.searchParams.get("turn") ?? "1", 10) || 1;

  if (env.twilio.validateSignature && env.twilio.authToken) {
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const valid = validateTwilioSignature(
      env.twilio.authToken,
      signature,
      reconstructUrl(req, base),
      params,
    );
    if (!valid) {
      return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`, 403);
    }
  }

  const speech = (params.SpeechResult ?? "").trim();
  const confidence = params.Confidence ? Number.parseFloat(params.Confidence) : undefined;

  const [profile, call] = await Promise.all([
    getProfile(),
    callId ? getCall(callId) : Promise.resolve(null),
  ]);
  const script = call?.scriptId ? await getScript(call.scriptId) : null;

  const decision = respond(speech, {
    profile,
    lead: call?.lead,
    script: script ?? undefined,
    turn,
    objective: call?.objective,
  });

  const now = new Date().toISOString();

  if (call) {
    const entries = [
      ...(speech
        ? [
            {
              at: now,
              speaker: "prospect" as const,
              text: confidence !== undefined ? `${speech}  (confidence ${confidence.toFixed(2)})` : speech,
            },
          ]
        : []),
      { at: now, speaker: "assistant" as const, text: decision.say },
    ];

    await appendTranscript(call.sid ?? "", entries).catch(() => null);

    if (!call.sid) {
      // Records keyed by id for dry runs or pre-dispatch calls.
      await updateCall(call.id, {
        transcript: [...call.transcript, ...entries],
        events: decision.note
          ? [...call.events, { at: now, status: `intent:${decision.intent}`, detail: decision.note }]
          : call.events,
      });
    } else {
      await updateCall(call.id, {
        events: decision.note
          ? [...call.events, { at: now, status: `intent:${decision.intent}`, detail: decision.note }]
          : call.events,
      });
    }

    // Honour an opt-out the instant it is spoken. No confirmation, no delay.
    if (decision.intent === "not_interested") {
      await addSuppression(call.to);
      await updateCall(call.id, {
        status: "completed",
        events: [
          ...call.events,
          { at: now, status: "opt_out", detail: `${call.to} suppressed permanently.` },
        ],
      });
    }
  }

  const nextTurnUrl = `${base}/api/twilio/turn?callId=${encodeURIComponent(callId)}&turn=${turn + 1}`;

  const xml = buildTurnTwiml({
    say: decision.say,
    action: decision.action === "listen" && turn >= MAX_TURNS + 3 ? "close" : decision.action,
    nextTurnUrl,
    transferNumber: env.twilio.transferNumber || profile.sender.callbackNumber || undefined,
    callerId: env.twilio.fromNumber || undefined,
  });

  return twiml(xml);
}

export async function GET(req: Request): Promise<Response> {
  return POST(req);
}
