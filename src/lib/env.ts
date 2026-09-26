import path from "node:path";

/**
 * Environment + capability detection.
 *
 * The console must never pretend an integration exists. Every surface reads
 * capability state from here so the UI can say plainly what is and isn't wired.
 */

export interface Env {
  twilio: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
    transferNumber: string;
    validateSignature: boolean;
  };
  fishAudio: {
    apiKey: string;
    referenceId: string;
    model: string;
  };
  llm: {
    geminiKey: string;
    openaiKey: string;
    groqKey: string;
    model: string;
  };
  liveCallsArmed: boolean;
  dailyCap: number;
  cooldownHours: number;
  publicBaseUrl: string;
  dataDir: string;
}

function str(key: string, fallback = ""): string {
  const value = process.env[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

/** First non-empty value among aliases, so operators can keep their own naming. */
function alias(keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = str(key);
    if (value) return value;
  }
  return fallback;
}

function num(key: string, fallback: number): number {
  const parsed = Number.parseInt(str(key), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getEnv(): Env {
  return {
    twilio: {
      accountSid: alias(["TWILIO_ACCOUNT_SID"]),
      authToken: alias(["TWILIO_AUTH_TOKEN"]),
      // Both namings accepted; TWILIO_PHONE_NUMBER is the common shorthand.
      fromNumber: alias(["TWILIO_FROM_NUMBER", "TWILIO_PHONE_NUMBER", "TWILIO_CALLER_ID"]),
      transferNumber: alias(["TWILIO_TRANSFER_NUMBER", "NEXOVIRA_TRANSFER_NUMBER"]),
      validateSignature: str("TWILIO_VALIDATE_SIGNATURE", "true") !== "false",
    },
    fishAudio: {
      apiKey: alias(["FISH_AUDIO_API_KEY", "FISH_API_KEY"]),
      // The voice model id. `reference_id` is Fish's own term for it.
      referenceId: alias(["FISH_AUDIO_REFERENCE_ID", "FISH_AUDIO_VOICE_ID", "FISH_VOICE_ID"]),
      model: str("FISH_AUDIO_MODEL", "s2.1-pro-free"),
    },
    llm: {
      geminiKey: alias(["GEMINI_API_KEY", "GOOGLE_API_KEY"]),
      openaiKey: alias(["OPENAI_API_KEY"]),
      groqKey: alias(["GROQ_API_KEY"]),
      model: str("NEXOVIRA_LLM_MODEL"),
    },
    liveCallsArmed: str("NEXOVIRA_LIVE_CALLS").toLowerCase() === "armed",
    dailyCap: num("NEXOVIRA_DAILY_CALL_CAP", 25),
    cooldownHours: num("NEXOVIRA_NUMBER_COOLDOWN_HOURS", 24),
    publicBaseUrl: str("PUBLIC_BASE_URL").replace(/\/+$/, ""),
    dataDir: str("NEXOVIRA_DATA_DIR", path.join(process.cwd(), "data")),
  };
}

/**
 * Credential shape validation.
 *
 * Cheap, offline, and catches the most common failure: a key mangled in
 * transit (bad paste, truncated token, wrong field). It proves nothing about
 * whether a credential is *active* — only that it is plausibly well-formed,
 * which is exactly the class of error worth catching before a dial.
 */
export interface CredentialFinding {
  service: "twilio" | "fishAudio" | "llm";
  field: string;
  ok: boolean;
  detail: string;
}

const HEX32 = /^[0-9a-f]{32}$/i;

export function credentialDiagnostics(env: Env): CredentialFinding[] {
  const findings: CredentialFinding[] = [];
  const add = (
    service: CredentialFinding["service"],
    field: string,
    value: string,
    test: (v: string) => boolean,
    expectation: string,
  ) => {
    if (!value) return; // unset is reported elsewhere as a missing capability
    const ok = test(value);
    findings.push({
      service,
      field,
      ok,
      detail: ok ? `well-formed (${expectation})` : `does not look like ${expectation}`,
    });
  };

  add("twilio", "TWILIO_ACCOUNT_SID", env.twilio.accountSid, (v) => /^AC[0-9a-f]{32}$/i.test(v), "an account SID (AC + 32 hex)");
  add("twilio", "TWILIO_AUTH_TOKEN", env.twilio.authToken, (v) => HEX32.test(v), "a 32-character hex auth token");
  add("twilio", "caller ID", env.twilio.fromNumber, (v) => /^\+[1-9]\d{7,14}$/.test(v), "an E.164 number");
  add("twilio", "transfer number", env.twilio.transferNumber, (v) => /^\+[1-9]\d{7,14}$/.test(v), "an E.164 number");

  add("fishAudio", "FISH_AUDIO_API_KEY", env.fishAudio.apiKey, (v) => /^sk-/.test(v) && v.length > 20, "a Fish Audio key (sk-…)");
  add("fishAudio", "voice id", env.fishAudio.referenceId, (v) => HEX32.test(v), "a 32-character hex voice model id");

  const llmKey = env.llm.geminiKey || env.llm.openaiKey || env.llm.groqKey;
  add("llm", "LLM key", llmKey, (v) => v.length > 20, "a provider API key");

  return findings;
}
export function resolveBaseUrl(req: Request, env: Env = getEnv()): string {
  if (env.publicBaseUrl) return env.publicBaseUrl;
  const h = req.headers;
  const forwardedHost = h.get("x-forwarded-host");
  const host = forwardedHost ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
