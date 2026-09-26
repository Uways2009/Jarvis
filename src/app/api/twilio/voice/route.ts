import { getEnv, resolveBaseUrl } from "@/lib/env";
import { getProfile } from "@/lib/profile";
import { getCall, getClip, getScript, updateCall } from "@/lib/repo";
import { composeScript } from "@/lib/composer";
import { buildVoiceTwiml, reconstructUrl, validateTwilioSignature } from "@/lib/twilio";
import { readForm, twiml } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Twilio fetches this the moment the call is answered.
 *
 * This is the fork in the road: answering-machine detection decides whether the
 * prospect gets a conversation or a twenty-second voicemail drop. Signature is
 * verified first — an unauthenticated webhook is an open door into the dialler.
 */
async function handle(req: Request): Promise<Response> {
  const env = getEnv();
  const base = resolveBaseUrl(req, env);
  const url = new URL(req.url);
  const params =
    req.method === "GET"
      ? Object.fromEntries(url.searchParams.entries())
      : await readForm(req);

  const callId = url.searchParams.get("callId") ?? params.callId ?? "";

  if (env.twilio.validateSignature && env.twilio.authToken) {
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const valid = validateTwilioSignature(
      env.twilio.authToken,
      signature,
      reconstructUrl(req, base),
      params,
    );
    if (!valid) {
      if (callId) {
        const call = await getCall(callId);
        if (call) {
          await updateCall(callId, {
            events: [
              ...call.events,
              {
                at: new Date().toISOString(),
                status: "rejected",
                detail:
                  "Inbound webhook failed signature validation. Check TWILIO_AUTH_TOKEN and PUBLIC_BASE_URL.",
              },
            ],
          });
        }
      }
      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
        403,
      );
    }
  }

  const [profile, call] = await Promise.all([
    getProfile(),
    callId ? getCall(callId) : Promise.resolve(null),
  ]);

  // Prefer the script this call was dispatched with. If it cannot be found
  // (purged store, restored record), recompose from the lead rather than
  // dropping to generic copy mid-call.
  const stored = call?.scriptId ? await getScript(call.scriptId) : null;
  const script =
    stored ?? (call?.lead ? composeScript(profile, call.lead, call.objective) : null);
  const clip = call?.clipId ? await getClip(call.clipId) : null;

  const answeredBy = params.AnsweredBy ?? "";
  const now = new Date().toISOString();

  if (call) {
    await updateCall(call.id, {
      answeredBy: answeredBy || call.answeredBy,
      status: "in-progress",
      telephonyStatus: "in-progress",
      events: [
        ...call.events,
        {
          at: now,
          status: "answered",
          detail: answeredBy ? `Answered by ${answeredBy}` : "Answered (no AMD result)",
        },
      ],
    });
  }

  const disclosure =
    script?.sections.find((s) => s.kind === "disclosure")?.lines.join(" ") ??
    profile.compliance.aiDisclosure;
  const opener = script?.sections.find((s) => s.kind === "opener")?.lines.join(" ") ?? "";
  const greeting = [disclosure, opener].filter(Boolean).join(" ").trim() ||
    `Hello — this is ${profile.sender.name || profile.company.name} calling from ${profile.company.name}.`;

  const voicemail = script?.voicemail ?? `${profile.company.name}. ${profile.company.oneLiner}`;

  const clipUrl = clip ? `${base}${clip.url}` : undefined;
  const isMachine = answeredBy.toLowerCase().startsWith("machine");

  const xml = buildVoiceTwiml({
    callId: callId,
    answeredBy,
    greeting,
    voicemail,
    clipUrl: isMachine ? undefined : clipUrl,
    voicemailClipUrl: isMachine && clip && clip.text.trim() === voicemail.trim() ? clipUrl : undefined,
    turnUrl: (turn) =>
      `${base}/api/twilio/turn?callId=${encodeURIComponent(callId)}&turn=${turn}`,
  });

  return twiml(xml);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

export async function GET(req: Request): Promise<Response> {
  return handle(req);
}
