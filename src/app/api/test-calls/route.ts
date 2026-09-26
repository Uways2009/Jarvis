import { normalizePhone, isE164 } from "@/lib/text";
import { respondToTest } from "@/lib/dialogue";
import { requireSession, sameOrigin } from "@/lib/test-calls/auth";
import { callError, TestCallError } from "@/lib/test-calls/config";
import { startCall } from "@/lib/test-calls/service";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (Number(req.headers.get("content-length") || 0) > 6000) throw new TestCallError("Request is too large.", 413);
    const raw = await req.text();
    if (raw.length > 6000) throw new TestCallError("Request is too large.", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new TestCallError("Supply valid JSON."); }
    const to = normalizePhone(body?.to);
    if (!isE164(to)) throw new TestCallError("Enter an international phone number, for example +2348012345678.");
    if (typeof body?.message !== "string" || !body.message.trim() || body.message.length > 600) throw new TestCallError("Enter a message between 1 and 600 characters.");
    const message = body.message.trim();
    if (body.mode === "rehearsal") {
      const turn = Number.isInteger(body.turn) && body.turn >= 1 && body.turn <= 4 ? body.turn : 0;
      const decision = turn ? respondToTest(typeof body.speech === "string" ? body.speech.slice(0, 500) : "", message, turn) : null;
      return Response.json({ ok: true, mode: "rehearsal", status: decision?.action === "hangup" ? "completed" : "in-progress", say: decision?.say || `Hello, this is Nexovira's automated test assistant. ${message} You can say stop or press any key to end this test.` });
    }
    if (body.mode !== "live") throw new TestCallError("Choose Rehearsal or Live.");
    requireSession(req);
    if (body.confirmPhrase !== "AUTHORIZE CALL") throw new TestCallError('Type the exact phrase "AUTHORIZE CALL".');
    if (body.consent !== true) throw new TestCallError("Confirm you own this number or have permission to call it.");
    if (typeof body.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(body.requestId)) throw new TestCallError("Invalid request ID. Start a new test.");
    if (body.voice !== "twilio" && body.voice !== "fish") throw new TestCallError("Choose a voice provider.");
    return Response.json({ ok: true, call: await startCall({ to, message, voice: body.voice, requestId: body.requestId }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return callError(error); }
}
