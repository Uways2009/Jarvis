import "server-only";
import crypto from "node:crypto";
import { operatorPassword, TestCallError } from "./config";

export function equal(a: string, b: string): boolean {
  const hash = (v: string) => crypto.createHash("sha256").update(v).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}
const signature = (value: string) => crypto.createHmac("sha256", operatorPassword()).update(value).digest("base64url");
export function sessionToken(): string {
  const expires = String(Date.now() + 3600_000);
  return `${expires}.${signature(expires)}`;
}
export function requireSession(req: Request) {
  const token = req.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith("nexovira_test="))?.slice(14) || "";
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) <= Date.now() || !equal(sig, signature(expires))) {
    throw new TestCallError("Unlock live testing with your operator password first.", 401);
  }
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  // Next's internal request URL can use 0.0.0.0 behind a proxy. Compare the
  // browser origin to the routed host instead. These headers never select a
  // Twilio webhook URL, and live routes still require the signed strict cookie.
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  let matches = false;
  try {
    const parsed = new URL(origin || "");
    matches = parsed.host === host && ["https:", "http:"].includes(parsed.protocol) && parsed.origin === origin;
  } catch { /* invalid or absent Origin */ }
  if (!matches || req.headers.get("sec-fetch-site") === "cross-site") throw new TestCallError("Cross-origin request refused.", 403);
}
