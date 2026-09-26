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

function num(key: string, fallback: number): number {
  const parsed = Number.parseInt(str(key), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getEnv(): Env {
  return {
    twilio: {
      accountSid: str("TWILIO_ACCOUNT_SID"),
      authToken: str("TWILIO_AUTH_TOKEN"),
      fromNumber: str("TWILIO_FROM_NUMBER"),
      transferNumber: str("TWILIO_TRANSFER_NUMBER"),
      validateSignature: str("TWILIO_VALIDATE_SIGNATURE", "true") !== "false",
    },
    fishAudio: {
      apiKey: str("FISH_AUDIO_API_KEY"),
      referenceId: str("FISH_AUDIO_REFERENCE_ID"),
      model: str("FISH_AUDIO_MODEL", "s2.1-pro-free"),
    },
    llm: {
      geminiKey: str("GEMINI_API_KEY"),
      openaiKey: str("OPENAI_API_KEY"),
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
 * Twilio fetches TwiML and audio over the public internet. Prefer an explicit
 * PUBLIC_BASE_URL; otherwise derive it from the request that triggered the call.
 */
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
