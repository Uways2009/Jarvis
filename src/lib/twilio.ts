import crypto from "node:crypto";
import type { Env } from "./env";
import { escapeXml } from "./text";

/**
 * Twilio Programmable Voice — REST calls and TwiML rendering.
 *
 * Implemented against the raw REST API rather than the helper library: fewer
 * moving parts, no version drift, and the request shape is visible in the code
 * where it belongs.
 */

const API_ROOT = "https://api.twilio.com/2010-04-01";

/**
 * Reaching Twilio's REST API should be sub-second. If it is not, something is
 * wrong and the operator needs to know rather than watch a spinner.
 */
const TWILIO_TIMEOUT_MS = 20_000;

export interface CreateCallInput {
  to: string;
  from: string;
  url: string;
  statusCallback: string;
  answeredByCallback?: string;
  record?: boolean;
  recordingCallback?: string;
  /** `Enable` returns fast on human; `DetectMessageEnd` waits for the beep. */
  machineDetection?: "Enable" | "DetectMessageEnd";
  ringTimeoutSeconds?: number;
  timeLimitSeconds?: number;
}

export interface TwilioResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: number;
  httpStatus: number;
}

function authHeader(env: Env): string {
  const token = Buffer.from(`${env.twilio.accountSid}:${env.twilio.authToken}`).toString("base64");
  return `Basic ${token}`;
}

async function parse<T>(res: Response): Promise<TwilioResult<T>> {
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (res.ok) {
    return { ok: true, data: body as T, httpStatus: res.status };
  }
  const err = body as { message?: string; code?: number } | undefined;
  return {
    ok: false,
    httpStatus: res.status,
    code: err?.code,
    error: err?.message ?? text.slice(0, 400) ?? `HTTP ${res.status}`,
  };
}

export async function createCall(
  env: Env,
  input: CreateCallInput,
): Promise<TwilioResult<{ sid: string; status: string; [k: string]: unknown }>> {
  if (!env.twilio.accountSid || !env.twilio.authToken) {
    return { ok: false, httpStatus: 0, error: "Twilio credentials are not configured." };
  }

  const form = new URLSearchParams();
  form.set("To", input.to);
  form.set("From", input.from);
  form.set("Url", input.url);
  form.set("Method", "POST");
  form.set("StatusCallback", input.statusCallback);
  form.set("StatusCallbackMethod", "POST");
  for (const event of ["initiated", "ringing", "answered", "completed"]) {
    form.append("StatusCallbackEvent", event);
  }
  form.set("MachineDetection", input.machineDetection ?? "Enable");
  form.set("MachineDetectionTimeout", "20");
  form.set("Timeout", String(input.ringTimeoutSeconds ?? 22));
  form.set("TimeLimit", String(input.timeLimitSeconds ?? 240));

  if (input.record) {
    form.set("Record", "true");
    form.set("RecordingChannels", "dual");
    if (input.recordingCallback) {
      form.set("RecordingStatusCallback", input.recordingCallback);
      form.set("RecordingStatusCallbackMethod", "POST");
      for (const event of ["in-progress", "completed"]) {
        form.append("RecordingStatusCallbackEvent", event);
      }
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_ROOT}/Accounts/${env.twilio.accountSid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: authHeader(env),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, httpStatus: 0, error: `Network failure reaching Twilio: ${describeNetworkError(error)}` };
  }

  return parse(res);
}

/** Turn a fetch rejection into something an operator can act on. */
function describeNetworkError(error: unknown): string {
  const err = error as Error & { cause?: { code?: string; message?: string } };
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    return `no response within ${TWILIO_TIMEOUT_MS / 1000}s — request aborted.`;
  }
  // Node collapses most transport failures into "fetch failed"; the real
  // diagnosis (ECONNRESET, ENOTFOUND, EAI_AGAIN) lives on `cause`.
  const code = err.cause?.code;
  if (code) return `${err.message} (${code})${err.cause?.message ? ` — ${err.cause.message}` : ""}`;
  return err.message;
}

export async function fetchCall(
  env: Env,
  sid: string,
): Promise<TwilioResult<Record<string, unknown>>> {
  try {
    const res = await fetch(`${API_ROOT}/Accounts/${env.twilio.accountSid}/Calls/${sid}.json`, {
      headers: { Authorization: authHeader(env) },
      cache: "no-store",
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    });
    return await parse(res);
  } catch (error) {
    return { ok: false, httpStatus: 0, error: `Network failure reaching Twilio: ${describeNetworkError(error)}` };
  }
}

export async function endCall(env: Env, sid: string): Promise<TwilioResult<Record<string, unknown>>> {
  try {
    const res = await fetch(`${API_ROOT}/Accounts/${env.twilio.accountSid}/Calls/${sid}.json`, {
      method: "POST",
      headers: {
        Authorization: authHeader(env),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Status: "completed" }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    });
    return await parse(res);
  } catch (error) {
    return { ok: false, httpStatus: 0, error: `Network failure reaching Twilio: ${describeNetworkError(error)}` };
  }
}

/* ── TwiML ───────────────────────────────────────────────────────────────── */

export interface VoiceTwimlInput {
  callId: string;
  /** `human`, `machine_start`, `machine_end_beep`, `unknown`, or empty. */
  answeredBy?: string;
  greeting: string;
  voicemail: string;
  turnUrl: (turn: number) => string;
  /** When set, audio is played instead of synthesised speech. */
  clipUrl?: string;
  /** Optional pre-rendered voicemail drop. */
  voicemailClipUrl?: string;
  language?: string;
  voice?: string;
}

/**
 * The first document Twilio fetches. Branches on answering-machine detection:
 * a human gets a conversation, a machine gets a twenty-second drop.
 */
export function buildVoiceTwiml(input: VoiceTwimlInput): string {
  const answered = (input.answeredBy ?? "").toLowerCase();
  const isMachine = answered.startsWith("machine") || answered === "fax";
  const voice = input.voice ?? "Polly.Matthew-Neural";
  const language = input.language ?? "en-GB";

  if (isMachine) {
    const drop = input.voicemailClipUrl
      ? `  <Play>${escapeXml(input.voicemailClipUrl)}</Play>`
      : `  <Say voice="${voice}" language="${language}">${escapeXml(input.voicemail)}</Say>`;
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Response>`,
      drop,
      `  <Hangup/>`,
      `</Response>`,
    ].join("\n");
  }

  const spoken = input.clipUrl
    ? `      <Play>${escapeXml(input.clipUrl)}</Play>`
    : `      <Say voice="${voice}" language="${language}">${escapeXml(input.greeting)}</Say>`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Response>`,
    `  <Gather input="speech"`,
    `          action="${escapeXml(input.turnUrl(1))}"`,
    `          method="POST"`,
    `          speechTimeout="auto"`,
    `          speechModel="phone_call"`,
    `          enhanced="true"`,
    `          language="${language}"`,
    `          timeout="6"`,
    `          bargeIn="true">`,
    spoken,
    `  </Gather>`,
    `  <Say voice="${voice}" language="${language}">${escapeXml(
      "No response — I will follow up by email instead. Thank you.",
    )}</Say>`,
    `  <Hangup/>`,
    `</Response>`,
  ].join("\n");
}

export interface TurnTwimlInput {
  say: string;
  action: "listen" | "close" | "transfer" | "hangup";
  nextTurnUrl?: string;
  /** The human to dial when a warm transfer is requested. */
  transferNumber?: string;
  /** The Twilio number presented as caller ID on the transfer leg. */
  callerId?: string;
  voice?: string;
  language?: string;
}

/** Subsequent documents: say the next line, then listen, close, or transfer. */
export function buildTurnTwiml(input: TurnTwimlInput): string {
  const voice = input.voice ?? "Polly.Matthew-Neural";
  const language = input.language ?? "en-GB";
  const say = (text: string) =>
    `<Say voice="${voice}" language="${language}">${escapeXml(text)}</Say>`;

  const lines = [`<?xml version="1.0" encoding="UTF-8"?>`, `<Response>`];

  if (input.action === "listen" && input.nextTurnUrl) {
    lines.push(
      `  <Gather input="speech"`,
      `          action="${escapeXml(input.nextTurnUrl)}"`,
      `          method="POST"`,
      `          speechTimeout="auto"`,
      `          speechModel="phone_call"`,
      `          enhanced="true"`,
      `          language="${language}"`,
      `          timeout="6"`,
      `          bargeIn="true">`,
      `    ${say(input.say)}`,
      `  </Gather>`,
      `  ${say("I will let you go — I will follow up in writing. Thank you for your time.")}`,
      `  <Hangup/>`,
    );
  } else if (input.action === "transfer") {
    lines.push(`  ${say(input.say)}`);
    if (input.transferNumber) {
      const callerIdAttr = input.callerId ? ` callerId="${escapeXml(input.callerId)}"` : "";
      lines.push(
        `  <Dial timeout="25"${callerIdAttr}>${escapeXml(input.transferNumber)}</Dial>`,
      );
    } else {
      lines.push(
        `  ${say(
          "There is no human available this second — I have your details and a colleague will call you back shortly.",
        )}`,
      );
    }
    lines.push(`  <Hangup/>`);
  } else {
    lines.push(`  ${say(input.say)}`, `  <Hangup/>`);
  }

  lines.push(`</Response>`);
  return lines.join("\n");
}

/* ── Webhook authenticity ────────────────────────────────────────────────── */

/**
 * Validate the `X-Twilio-Signature` header (HMAC-SHA1 over the full URL plus
 * the sorted form parameters).
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!authToken || !signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Public URL Twilio actually requested, accounting for proxy headers. */
export function reconstructUrl(req: Request, baseUrl: string): string {
  const url = new URL(req.url);
  return `${baseUrl}${url.pathname}${url.search}`;
}
