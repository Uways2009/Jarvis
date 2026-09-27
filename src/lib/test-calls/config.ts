import "server-only";
import { getEnv } from "../env";
import { isE164, normalizePhone } from "../text";

export class TestCallError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function testBaseUrl(): string {
  const configured = process.env.APP_URL || process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  let url: URL;
  try { url = new URL(configured); } catch { throw new TestCallError("Set APP_URL to your public HTTPS Vercel origin.", 503); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)) {
    throw new TestCallError("APP_URL must be a public HTTPS origin without a path or credentials.", 503);
  }
  return url.origin;
}

export function operatorPassword(): string {
  const password = process.env.NEXOVIRA_TEST_PASSWORD || "";
  if (password.length < 16) throw new TestCallError("Configure NEXOVIRA_TEST_PASSWORD with at least 16 characters.", 503);
  return password;
}

export function liveConfig(to: string) {
  if (process.env.NEXOVIRA_LIVE_CALLS !== "armed") throw new TestCallError("Live calling is disarmed. Set NEXOVIRA_LIVE_CALLS=armed and redeploy.", 403);
  const env = getEnv();
  if (!/^AC[0-9a-f]{32}$/i.test(env.twilio.accountSid) || !env.twilio.authToken || !isE164(env.twilio.fromNumber)) {
    throw new TestCallError("Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER (international format).", 503);
  }
  const allowed = (process.env.NEXOVIRA_TEST_NUMBERS || "").split(",").map(normalizePhone).filter(isE164);
  if (!allowed.includes(to)) throw new TestCallError("This number is not in NEXOVIRA_TEST_NUMBERS. Only your own consenting test numbers may be called.", 403);
  if (to === env.twilio.fromNumber) throw new TestCallError("Use your receiving phone number, not the Twilio caller ID.");
  return { env, base: testBaseUrl() };
}

export function callError(error: unknown): Response {
  if (error instanceof TestCallError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  // Never serialize provider responses, SDK objects or credentials to the browser.
  return Response.json({ ok: false, error: "The call service is unavailable. Check the server configuration and try again later." }, { status: 503 });
}
