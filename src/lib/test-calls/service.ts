import "server-only";
import crypto from "node:crypto";
import twilio from "twilio";
import { getEnv } from "../env";
import { key, redis, RESERVE, TTL } from "./redis";
import { liveConfig, TestCallError } from "./config";

export type TestCall = { id: string; to: string; message: string; voice: "twilio" | "fish"; base: string; createdAt: string };
export const terminal = new Set(["completed", "failed", "busy", "no-answer", "canceled"]);
export function client() {
  const env = getEnv();
  return twilio(env.twilio.accountSid, env.twilio.authToken, { timeout: 10000, autoRetry: false, keepAlive: false });
}
export function providerError(error: unknown): string {
  const code = Number((error as { code?: number })?.code);
  const messages: Record<number, string> = {
    20003: "Twilio authentication failed. Check the account SID and auth token.",
    21211: "Twilio rejected the destination. Check the country code and phone number.",
    21212: "The caller ID is invalid. Use your Twilio voice-capable phone number.",
    21214: "Twilio cannot reach this destination number.",
    21215: "Calling this country is not enabled. Check Twilio Voice geographic permissions.",
    21608: "This trial account can only call verified recipients. Verify the receiving number in Twilio.",
    21219: "Verify this destination in Twilio before calling from a trial account.",
    20429: "Twilio rate-limited this request. Wait before making another test.",
    11200: "Twilio could not reach the webhook. Check APP_URL and Vercel deployment protection.",
    11205: "The voice webhook timed out. Check the Vercel function logs.",
    13224: "Twilio could not use the configured voice.",
  };
  return messages[code] ?? (Number.isFinite(code) ? `Twilio reported error ${code}. Check this call in Twilio Console for details.` : "No confirmed response from Twilio. The call may have been created. Check Twilio Console before retrying; this request will not be automatically retried.");
}
export async function loadCall(id: string): Promise<TestCall> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new TestCallError("Invalid call ID.", 404);
  const raw = await redis<string | null>("HGET", key(`call:${id}`), "meta");
  if (!raw) throw new TestCallError("Test call expired or was not found.", 404);
  return JSON.parse(raw);
}
export async function callView(id: string) {
  const call = await loadCall(id);
  const [sid, status, error] = await redis<(string | null)[]>("HMGET", key(`call:${id}`), "sid", "status", "error");
  const transcript = await redis<string[]>("LRANGE", key(`transcript:${id}`), 0, 30);
  return { id, to: call.to, status: status || "preparing", error: error || undefined, hasSid: Boolean(sid), transcript: transcript.map(v => JSON.parse(v)) };
}
export async function transcript(id: string, speaker: string, text: string) {
  await redis("RPUSH", key(`transcript:${id}`), JSON.stringify({ speaker, text }));
  await redis("EXPIRE", key(`transcript:${id}`), TTL);
}

export async function startCall(input: { to: string; message: string; voice: "twilio" | "fish"; requestId: string }) {
  const { env, base } = liveConfig(input.to);
  if (await redis("GET", key(`suppressed:${input.to}`))) throw new TestCallError("This number opted out of test calls. No call was placed.", 403);
  const id = crypto.randomUUID();
  const call: TestCall = { id, to: input.to, message: input.message, voice: input.voice, base, createdAt: new Date().toISOString() };
  await redis("HSET", key(`call:${id}`), "meta", JSON.stringify(call), "status", "preparing");
  await redis("EXPIRE", key(`call:${id}`), TTL);
  const reserved = await redis<string>("EVAL", RESERVE, 3, key(`request:${input.requestId}`), key("pacing"), key("daily"), id);
  if (reserved === "cooldown" || reserved === "daily-cap") throw new TestCallError(reserved === "cooldown" ? "Wait 60 seconds between live test calls." : "Test limit reached: 10 attempts per rolling 24 hours.", 429);
  if (reserved !== "reserved") {
    const previous = await loadCall(reserved);
    if (previous.to !== input.to || previous.message !== input.message || previous.voice !== input.voice) {
      throw new TestCallError("This request ID belongs to another test. Recover that call or start a new test after checking its status.", 409);
    }
    return callView(reserved);
  }
  let result;
  try {
    result = await client().calls.create({
      to: input.to, from: env.twilio.fromNumber,
      url: `${base}/api/twilio/test/voice?id=${id}`, method: "POST",
      statusCallback: `${base}/api/twilio/test/status?id=${id}`, statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      timeout: 25, timeLimit: 120, record: false,
    });
  } catch (error) {
    const status = Number((error as { status?: number })?.status);
    const definiteRejection = status >= 400 && status < 500;
    await redis("HSET", key(`call:${id}`), "status", definiteRejection ? "failed" : "unknown", "error", providerError(error));
    return callView(id);
  }
  // A signed callback may arrive before the create response. Do not regress its state.
  await redis("HSET", key(`call:${id}`), "sid", result.sid);
  await redis("EVAL", "if redis.call('HGET',KEYS[1],'status')=='preparing' then redis.call('HSET',KEYS[1],'status',ARGV[1]) end; return 1", 1, key(`call:${id}`), result.status);
  return callView(id);
}
