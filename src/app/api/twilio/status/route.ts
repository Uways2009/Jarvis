import { getEnv, resolveBaseUrl } from "@/lib/env";
import { getCall, mutateCallBySid } from "@/lib/repo";
import { reconstructUrl, validateTwilioSignature } from "@/lib/twilio";
import { readForm } from "@/lib/http";
import type { CallStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Lifecycle callbacks: initiated → ringing → answered → completed, plus the
 * recorded artefact when recording is enabled.
 */
function mapStatus(status: string): CallStatus {
  const s = status.toLowerCase().replace(/_/g, "-");
  if (["queued", "initiated", "ringing", "in-progress", "completed", "busy", "no-answer", "canceled", "failed"].includes(s)) {
    return s as CallStatus;
  }
  return "completed";
}

export async function POST(req: Request): Promise<Response> {
  const env = getEnv();
  const base = resolveBaseUrl(req, env);
  const params = await readForm(req);
  const url = new URL(req.url);
  const callId = url.searchParams.get("callId") ?? "";

  if (env.twilio.validateSignature && env.twilio.authToken) {
    const signature = req.headers.get("x-twilio-signature") ?? "";
    if (!validateTwilioSignature(env.twilio.authToken, signature, reconstructUrl(req, base), params)) {
      return new Response("Invalid signature", { status: 403 });
    }
  }

  const sid = params.CallSid ?? "";
  if (!sid) return new Response("Missing CallSid", { status: 400 });

  const status = params.CallStatus ?? "completed";
  const now = new Date().toISOString();

  await mutateCallBySid(sid, (call) => ({
    ...call,
    status: mapStatus(status),
    telephonyStatus: status,
    durationSeconds: params.CallDuration ? Number.parseInt(params.CallDuration, 10) : call.durationSeconds,
    price: params.Price ?? call.price,
    priceUnit: params.PriceUnit ?? call.priceUnit,
    answeredBy: params.AnsweredBy ?? call.answeredBy,
    recordingUrl: params.RecordingUrl ?? call.recordingUrl,
    events: [
      ...call.events,
      {
        at: now,
        status,
        detail: [
          params.CallDuration ? `${params.CallDuration}s` : "",
          params.RecordingUrl ? "recording available" : "",
          params.SipResponseCode ? `sip ${params.SipResponseCode}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      },
    ],
  }));

  // If the SID was not yet persisted (rare race), still record the fact.
  if (callId) {
    const local = await getCall(callId);
    if (local && !local.sid) {
      const { updateCall } = await import("@/lib/repo");
      await updateCall(callId, {
        sid,
        status: mapStatus(status),
        telephonyStatus: status,
      });
    }
  }

  return new Response(null, { status: 204 });
}
