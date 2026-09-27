import "server-only";
import crypto from "node:crypto";
import twilio from "twilio";
import { getEnv } from "../env";
import { readForm, twiml } from "../http";
import { respondToTest } from "../dialogue";
import { synthesize } from "../fishaudio";
import { testBaseUrl } from "./config";
import { key, redis } from "./redis";
import { loadCall, providerError, terminal, transcript, type TestCall } from "./service";

const hangup = () => { const xml = new twilio.twiml.VoiceResponse(); xml.hangup(); return xml.toString(); };

async function render(call: TestCall, say: string, nextTurn: number | null): Promise<string> {
  const xml = new twilio.twiml.VoiceResponse();
  const target = nextTurn === null ? xml : xml.gather({
    input: ["speech", "dtmf"], numDigits: 1, timeout: 5, speechTimeout: "auto",
    action: `${call.base}/api/twilio/test/turn?id=${call.id}&turn=${nextTurn}`, method: "POST", actionOnEmptyResult: true,
  });
  let audio: string | null = null;
  if (call.voice === "fish") {
    try {
      const result = await synthesize(getEnv(), { text: say, format: "mp3", latency: "low", timeoutMs: 4000 });
      // Bound Redis object size. Failed/slow TTS falls back to Twilio speech.
      if (result.ok && result.bytes.length <= 700_000) {
        const token = crypto.randomBytes(24).toString("hex");
        await redis("SET", key(`audio:${token}`), Buffer.from(result.bytes).toString("base64"), "EX", 600);
        audio = `${call.base}/api/twilio/test/audio?token=${token}`;
      }
    } catch { /* Say is a reliable fallback; never fail a call solely over optional TTS. */ }
  }
  if (audio) target.play(audio);
  else target.say({ voice: "alice", language: "en-US" }, say);
  xml.hangup();
  return xml.toString();
}

export async function testWebhook(req: Request, event: string): Promise<Response> {
  if (!["voice", "turn", "status"].includes(event)) return new Response("Not found", { status: 404 });
  try {
    const url = new URL(req.url);
    const params = await readForm(req);
    const env = getEnv();
    const canonical = `${testBaseUrl()}${url.pathname}${url.search}`;
    // Mandatory for this test flow, even if the older route's optional setting is disabled.
    if (!env.twilio.authToken || !twilio.validateRequest(env.twilio.authToken, req.headers.get("x-twilio-signature") || "", canonical, params)) {
      return twiml(hangup(), 403);
    }
    const call = await loadCall(url.searchParams.get("id") || "");
    if (params.AccountSid !== env.twilio.accountSid || params.To !== call.to || !/^CA[0-9a-f]{32}$/i.test(params.CallSid || "")) return twiml(hangup(), 403);
    const bound = await redis<number>("EVAL", "local sid=redis.call('HGET',KEYS[1],'sid'); if sid and sid~=ARGV[1] then return 0 end; redis.call('HSET',KEYS[1],'sid',ARGV[1]); return 1", 1, key(`call:${call.id}`), params.CallSid);
    if (!bound) return twiml(hangup(), 403);
    if (event === "status") {
      const allowed = ["queued", "initiated", "ringing", "in-progress", ...terminal];
      const sequence = Number(params.SequenceNumber);
      if (!allowed.includes(params.CallStatus) || !Number.isInteger(sequence) || sequence < 0) return new Response("Invalid status", { status: 400 });
      // Out-of-order/duplicate callbacks cannot regress a call's status.
      await redis("EVAL", `local seq=tonumber(redis.call('HGET',KEYS[1],'sequence') or '-1');
        local old=redis.call('HGET',KEYS[1],'status');
        if tonumber(ARGV[1])>seq then
          redis.call('HSET',KEYS[1],'sequence',ARGV[1]);
          if old~='completed' and old~='failed' and old~='busy' and old~='no-answer' and old~='canceled' then
            redis.call('HSET',KEYS[1],'status',ARGV[2],'error',ARGV[3]);
          end
        end; return 1`, 1, key(`call:${call.id}`), sequence, params.CallStatus, params.ErrorCode ? providerError({ code: Number(params.ErrorCode) }) : "");
      return new Response(null, { status: 204 });
    }
    if (process.env.NEXOVIRA_LIVE_CALLS !== "armed") return twiml(hangup());
    const turn = event === "voice" ? 0 : Number(url.searchParams.get("turn"));
    if (!Number.isInteger(turn) || turn < (event === "voice" ? 0 : 1) || turn > 4) return twiml(hangup());
    const cacheKey = key(`twiml:${call.id}:${turn}`);
    const cached = await redis<string | null>("GET", cacheKey);
    if (cached) return twiml(cached);
    const speech = params.Digits ? "stop" : (params.SpeechResult || "").slice(0, 500);
    const decision = turn ? respondToTest(speech, call.message, turn) : null;
    if (decision?.intent === "not_interested") {
      // No expiry: opt-outs survive call-log retention and warm/cold starts.
      await redis("SET", key(`suppressed:${call.to}`), "1");
    }
    const say = decision?.say || `Hello, this is Nexovira's automated test assistant. ${call.message} You can say stop or press any key to end this test.`;
    const next = decision?.action === "hangup" || turn >= 4 ? null : turn + 1;
    const xml = await render(call, say, next);
    // Cache result before transcript writes. Retries reuse generated audio/TwiML.
    const saved = await redis("SET", cacheKey, xml, "EX", 600, "NX");
    if (!saved) return twiml((await redis<string>("GET", cacheKey)) || xml);
    if (turn) await transcript(call.id, "You", speech || "(silence)");
    await transcript(call.id, "Assistant", say);
    return twiml(xml);
  } catch {
    if (event === "status") return new Response("Status storage temporarily unavailable", { status: 503 });
    // Valid TwiML even on dependency failure. Do not expose infrastructure details to callers.
    const xml = new twilio.twiml.VoiceResponse();
    xml.say("The test service is unavailable. Please try again later. Goodbye."); xml.hangup();
    return twiml(xml.toString());
  }
}

export async function testAudio(req: Request): Promise<Response> {
  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!/^[a-f0-9]{48}$/.test(token)) return new Response(null, { status: 404 });
    const audio = await redis<string | null>("GET", key(`audio:${token}`));
    if (!audio) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(Buffer.from(audio, "base64")), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 503 }); }
}
