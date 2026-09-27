import assert from "node:assert/strict";
import { test } from "node:test";
import nock from "nock";
import twilio from "twilio";
import { POST } from "../src/app/api/test-calls/route";
import { POST as login } from "../src/app/api/test-calls/session/route";
import { POST as control } from "../src/app/api/test-calls/[id]/route";
import { POST as webhook, GET as audio } from "../src/app/api/twilio/test/[event]/route";
import { testBaseUrl } from "../src/lib/test-calls/config";
import { RESERVE, key } from "../src/lib/test-calls/redis";

const origin = "https://nexovira-test.example";
const account = "AC" + "a".repeat(32);
const sid = "CA" + "c".repeat(32);
const token = "b".repeat(32);
const to = "+14155551212";
let cookie = "";
function request(path: string, body: unknown, authenticated = true) {
  return new Request(origin + path, { method: "POST", headers: { origin, "content-type": "application/json", ...(authenticated ? { cookie } : {}) }, body: JSON.stringify(body) });
}
const payload = (overrides = {}) => ({ mode: "live", to, message: "Can you hear this test?", voice: "twilio", consent: true, confirmPhrase: "AUTHORIZE CALL", requestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", ...overrides });

/** REST Redis test double. Lua commands are modeled to exercise shared-instance behavior. */
function mockRedis() {
  const values = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const lists = new Map<string, string[]>();
  let commands = 0;
  nock("https://redis.example").persist().post("/").reply((_uri, body) => {
    commands++;
    const args = (typeof body === "string" ? JSON.parse(body) : body) as (string | number)[];
    const [cmd, ...raw] = args; const a = raw.map(String); let result: unknown = null;
    const hash = (k: string) => { if (!hashes.has(k)) hashes.set(k, {}); return hashes.get(k)!; };
    switch (cmd) {
      case "GET": result = values.get(a[0]) ?? null; break;
      case "SET": if (!a.includes("NX") || !values.has(a[0])) { values.set(a[0], a[1]); result = "OK"; } break;
      case "EXPIRE": result = 1; break;
      case "HSET": for (let i = 1; i < a.length; i += 2) hash(a[0])[a[i]] = a[i + 1]; result = 1; break;
      case "HGET": result = hash(a[0])[a[1]] ?? null; break;
      case "HMGET": result = a.slice(1).map(k => hash(a[0])[k] ?? null); break;
      case "RPUSH": lists.set(a[0], [...(lists.get(a[0]) || []), a[1]]); result = 1; break;
      case "LRANGE": result = lists.get(a[0]) || []; break;
      case "EVAL": {
        const script = a[0], k = a[2], h = hash(k);
        if (script === RESERVE) {
          if (values.has(k)) result = values.get(k);
          else if (values.has(a[3])) result = "cooldown";
          else if (Number(values.get(a[4]) || 0) >= 10) result = "daily-cap";
          else { values.set(k, a[5]); values.set(a[3], "1"); values.set(a[4], String(Number(values.get(a[4]) || 0) + 1)); result = "reserved"; }
        } else if (script.includes("local n=")) {
          result = Number(values.get(k) || 0) + 1; values.set(k, String(result));
        } else if (script.includes("local sid=")) {
          result = h.sid && h.sid !== a[3] ? 0 : 1; if (result) h.sid = a[3];
        } else if (script.includes("local seq=")) {
          if (Number(a[3]) > Number(h.sequence || -1)) {
            h.sequence = a[3];
            if (!["completed", "failed", "busy", "no-answer", "canceled"].includes(h.status)) { h.status = a[4]; h.error = a[5]; }
          }
          result = 1;
        } else if (script.includes("=='preparing'")) { if (h.status === "preparing") h.status = a[3]; result = 1; }
        else if (script.includes("old==ARGV[1]")) { if (h.status === a[3]) h.status = a[4]; result = 1; }
        else throw new Error("Unmodeled Lua script");
        break;
      }
      default: throw new Error("Unexpected Redis command " + cmd);
    }
    return [200, { result }];
  });
  return { values, hashes, commands: () => commands };
}
async function signed(event: string, id: string, params: Record<string, string> = {}, turn?: number, valid = true) {
  const path = `/api/twilio/test/${event}?id=${id}${turn ? `&turn=${turn}` : ""}`;
  const fields = { AccountSid: account, CallSid: sid, To: to, ...params };
  const signature = twilio.getExpectedTwilioSignature(token, origin + path, fields);
  return webhook(new Request(origin + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": valid ? signature : "invalid" }, body: new URLSearchParams(fields) }), { params: Promise.resolve({ event }) });
}

test("Vercel live test flow: actual SDK transport, shared limits, callbacks, speech and end call (mocked providers)", async () => {
  nock.disableNetConnect();
  const previous = { ...process.env };
  Object.assign(process.env, { APP_URL: origin, TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: token, TWILIO_PHONE_NUMBER: "+14155551213", NEXOVIRA_TEST_NUMBERS: to, NEXOVIRA_TEST_PASSWORD: "long-test-password-only", UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "redis-private-test-key", NEXOVIRA_LIVE_CALLS: "armed" });
  delete process.env.TWILIO_FROM_NUMBER;
  const redis = mockRedis();
  try {
    const rehearsal = await POST(request("/api/test-calls", payload({ mode: "rehearsal" }), false));
    assert.equal(rehearsal.status, 200);
    assert.match((await rehearsal.json()).say, /automated test assistant/);
    assert.equal(redis.commands(), 0, "rehearsal must not call Redis or Twilio");
    const proxied = request("/api/test-calls", payload({ mode: "rehearsal" }), false);
    proxied.headers.set("x-forwarded-host", new URL(origin).host);
    const internal = new Request("http://0.0.0.0:3000/api/test-calls", proxied);
    assert.equal((await POST(internal)).status, 200, "proxy routing must not break same-origin requests");
    const stop = await POST(request("/api/test-calls", payload({ mode: "rehearsal", turn: 1, speech: "stop" }), false));
    assert.equal((await stop.json()).status, "completed");
    assert.equal((await POST(request("/api/test-calls", payload(), false))).status, 401);
    assert.equal((await login(request("/api/test-calls/session", { password: "wrong" }, false))).status, 401);
    const unlocked = await login(request("/api/test-calls/session", { password: "long-test-password-only" }, false));
    assert.equal(unlocked.status, 200);
    assert.match(unlocked.headers.get("set-cookie")!, /HttpOnly; Secure; SameSite=Strict/);
    cookie = unlocked.headers.get("set-cookie")!.split(";")[0];
    delete process.env.NEXOVIRA_LIVE_CALLS;
    assert.equal((await POST(request("/api/test-calls", payload()))).status, 403);
    process.env.NEXOVIRA_LIVE_CALLS = "armed";
    assert.equal((await POST(request("/api/test-calls", payload({ confirmPhrase: "authorize call" })))).status, 400);
    assert.equal((await POST(request("/api/test-calls", payload({ to: "+14155559999" })))).status, 403);
    assert.equal((await POST(request("/api/test-calls", payload({ to: "local-number" })))).status, 400);
    const crossOrigin = request("/api/test-calls", payload()); crossOrigin.headers.set("origin", "https://attacker.example");
    assert.equal((await POST(crossOrigin)).status, 403);

    let submitted: URLSearchParams | undefined;
    const carrier = nock("https://api.twilio.com").post(`/2010-04-01/Accounts/${account}/Calls.json`, body => {
      submitted = new URLSearchParams(typeof body === "string" ? body : undefined);
      if (typeof body !== "string") for (const [name, value] of Object.entries(body)) {
        for (const item of Array.isArray(value) ? value : [value]) submitted.append(name, String(item));
      }
      return true;
    }).basicAuth({ user: account, pass: token }).reply(201, { sid, status: "queued" });
    const dispatched = await POST(request("/api/test-calls", payload()));
    assert.equal(dispatched.status, 200);
    const data = await dispatched.json(); const id = data.call.id;
    assert.equal(data.call.status, "queued"); assert.ok(carrier.isDone(), "official SDK must send the Twilio API request");
    assert.equal(submitted!.get("To"), to);
    assert.equal(submitted!.get("From"), "+14155551213");
    assert.equal(submitted!.get("Url"), `${origin}/api/twilio/test/voice?id=${id}`);
    assert.equal(submitted!.get("TimeLimit"), "120");
    assert.deepEqual(submitted!.getAll("StatusCallbackEvent"), ["initiated", "ringing", "answered", "completed"]);
    assert.ok(!JSON.stringify(data).includes(account)); assert.ok(!JSON.stringify(data).includes(token));
    const again = await POST(request("/api/test-calls", payload()));
    assert.equal((await again.json()).call.id, id, "duplicate request reuses the original carrier call");
    const next = payload({ requestId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    assert.equal((await POST(request("/api/test-calls", next))).status, 429);
    redis.values.delete(key("pacing")); redis.values.set(key("daily"), "10");
    assert.equal((await POST(request("/api/test-calls", next))).status, 429);
    assert.equal((await signed("voice", id, {}, undefined, false)).status, 403);
    const opening = await (await signed("voice", id)).text();
    assert.match(opening, /<Response>/); assert.match(opening, /<Gather/); assert.match(opening, /automated test assistant/); assert.match(opening, /turn=1/);
    const reply = await (await signed("turn", id, { SpeechResult: "yes" }, 1)).text();
    assert.match(reply, /I received your response/);
    await signed("status", id, { CallStatus: "in-progress", SequenceNumber: "2" });
    await signed("status", id, { CallStatus: "ringing", SequenceNumber: "1" });
    assert.equal(redis.hashes.get(key(`call:${id}`))!.status, "in-progress");
    const ended = nock("https://api.twilio.com").post(`/2010-04-01/Accounts/${account}/Calls/${sid}.json`, "Status=completed").reply(200, { sid, status: "completed" });
    const end = await control(request(`/api/test-calls/${id}`, { action: "end" }), { params: Promise.resolve({ id }) });
    assert.equal((await end.json()).call.status, "completed"); assert.ok(ended.isDone());
    await signed("status", id, { CallStatus: "ringing", SequenceNumber: "3" });
    assert.equal(redis.hashes.get(key(`call:${id}`))!.status, "completed");
    const goodbye = await (await signed("turn", id, { SpeechResult: "stop" }, 2)).text();
    assert.match(goodbye, /<Hangup/); assert.doesNotMatch(goodbye, /<Gather/);
    assert.equal(redis.values.get(key(`suppressed:${to}`)), "1");
    assert.equal((await POST(request("/api/test-calls", next))).status, 403);

    // Optional Fish speech shares the existing server-side synthesis implementation.
    redis.hashes.get(key(`call:${id}`))!.meta = JSON.stringify({ ...JSON.parse(redis.hashes.get(key(`call:${id}`))!.meta), voice: "fish" });
    process.env.FISH_AUDIO_API_KEY = "private-fish-key";
    process.env.FISH_AUDIO_VOICE_ID = "d".repeat(32);
    const fish = nock("https://api.fish.audio").post("/v1/tts", body => body.reference_id === "d".repeat(32)).matchHeader("authorization", "Bearer private-fish-key").reply(200, Buffer.from([1, 2, 3]), { "content-type": "audio/mpeg" });
    const voiced = await (await signed("turn", id, { SpeechResult: "what was the message?" }, 3)).text();
    assert.ok(fish.isDone()); assert.match(voiced, /<Play>/);
    const audioUrl = voiced.match(/<Play>(.*?)<\/Play>/)![1].replaceAll("&amp;", "&");
    const clip = await audio(new Request(audioUrl), { params: Promise.resolve({ event: "audio" }) });
    assert.equal(clip.headers.get("content-type"), "audio/mpeg");
    assert.deepEqual(new Uint8Array(await clip.arrayBuffer()), new Uint8Array([1, 2, 3]));
    nock("https://api.fish.audio").post("/v1/tts").reply(503, "unavailable");
    assert.match(await (await signed("turn", id, { SpeechResult: "yes" }, 4)).text(), /<Say/);

    // Provider rejection becomes a useful, sanitized message. No raw SDK object reaches the UI.
    redis.values.delete(key(`suppressed:${to}`)); redis.values.delete(key("pacing")); redis.values.delete(key("daily"));
    nock("https://api.twilio.com").post(`/2010-04-01/Accounts/${account}/Calls.json`).reply(400, { code: 21219, message: `private detail ${account}` });
    const rejected = await (await POST(request("/api/test-calls", next))).json();
    assert.equal(rejected.call.status, "failed"); assert.match(rejected.call.error, /Verify this destination/); assert.ok(!JSON.stringify(rejected).includes(account));
    process.env.APP_URL = "http://localhost:3000";
    assert.throws(testBaseUrl, /public HTTPS/);
    assert.ok(nock.isDone(), nock.pendingMocks().join("\n"));
  } finally {
    nock.cleanAll(); nock.enableNetConnect();
    for (const name of Object.keys(process.env)) if (!(name in previous)) delete process.env[name];
    Object.assign(process.env, previous);
  }
});
