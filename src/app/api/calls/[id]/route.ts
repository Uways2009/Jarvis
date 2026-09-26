import { getEnv } from "@/lib/env";
import { endCall, fetchCall } from "@/lib/twilio";
import { getCall, updateCall } from "@/lib/repo";
import { addSuppression } from "@/lib/safety";
import { json, readJsonBody } from "@/lib/http";
import type { CallStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function mapStatus(status: string | undefined): CallStatus {
  const s = (status ?? "").toLowerCase();
  if (["queued", "initiated", "ringing", "in-progress", "completed", "busy", "no-answer", "canceled", "failed"].includes(s)) {
    return s as CallStatus;
  }
  return "queued";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const call = await getCall(id);
  if (!call) return json({ ok: false, error: "Call not found." }, 404);
  return json({ ok: true, call });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = await readJsonBody<{ action?: "sync" | "hangup" | "suppress" }>(req);
  const call = await getCall(id);
  if (!call) return json({ ok: false, error: "Call not found." }, 404);

  const env = getEnv();

  if (body?.action === "suppress") {
    await addSuppression(call.to);
    const updated = await updateCall(id, {
      events: [
        ...call.events,
        { at: new Date().toISOString(), status: "suppressed", detail: "Number added to opt-out list." },
      ],
    });
    return json({ ok: true, call: updated, note: "Number suppressed permanently." });
  }

  if (body?.action === "hangup") {
    if (!call.sid) return json({ ok: false, error: "No Twilio SID on this record." }, 400);
    const result = await endCall(env, call.sid);
    const updated = await updateCall(id, {
      status: result.ok ? "completed" : call.status,
      events: [
        ...call.events,
        {
          at: new Date().toISOString(),
          status: "hangup",
          detail: result.ok ? "Operator ended the call." : result.error,
        },
      ],
    });
    return json({ ok: result.ok, call: updated, error: result.error });
  }

  // Default: reconcile with Twilio.
  if (!call.sid) {
    return json({ ok: true, call, note: "Dry run — nothing to reconcile." });
  }

  const result = await fetchCall(env, call.sid);
  if (!result.ok) return json({ ok: false, error: result.error }, 502);

  const data = result.data ?? {};
  const updated = await updateCall(id, {
    status: mapStatus(data.status as string | undefined),
    telephonyStatus: data.status as string | undefined,
    durationSeconds: data.duration ? Number.parseInt(String(data.duration), 10) : call.durationSeconds,
    price: (data.price as string | null) ?? call.price,
    priceUnit: (data.price_unit as string | null) ?? call.priceUnit,
    answeredBy: (data.answered_by as string | null) ?? call.answeredBy,
    events: [
      ...call.events,
      {
        at: new Date().toISOString(),
        status: "synced",
        detail: `Twilio reports ${String(data.status ?? "unknown")}`,
      },
    ],
  });

  return json({ ok: true, call: updated });
}
