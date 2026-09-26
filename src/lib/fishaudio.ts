import type { Env } from "./env";

/**
 * Fish Audio text-to-speech.
 *
 * One POST, bearer auth, the model chosen by *header* (not body — a common
 * trip-up), and a raw audio stream back rather than a JSON envelope.
 */

export const FISH_ENDPOINT = "https://api.fish.audio/v1/tts";

/** `s2.1-pro-free` is the same weights as `s2.1-pro` and costs nothing to test with. */
export const FISH_MODELS = ["s2.1-pro-free", "s2.1-pro", "s2-pro", "s1"] as const;
export type FishModel = (typeof FISH_MODELS)[number];

export interface SynthesizeInput {
  text: string;
  /** Shorter budget for interactive phone webhooks; defaults to the studio budget. */
  timeoutMs?: number;
  referenceId?: string;
  model?: string;
  format?: "mp3" | "wav" | "opus" | "pcm";
  bitrate?: 64 | 128 | 192;
  temperature?: number;
  latency?: "normal" | "balanced" | "low";
}

export type SynthesizeResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; error: string; httpStatus: number };

/**
 * Synthesis of a full call script can legitimately take a while, so the ceiling
 * is generous — but it is still a ceiling. A hung request must not hold the UI.
 */
const SYNTHESIS_TIMEOUT_MS = 90_000;

/** Expression tags Fish understands inline in the text. */
export const EMOTION_TAGS = [
  "[warm]",
  "[confident]",
  "[chuckle]",
  "[emphasis]",
  "[pause]",
  "[whisper]",
  "[sympathetic]",
  "[curious]",
] as const;

export function isFishConfigured(env: Env): boolean {
  return env.fishAudio.apiKey.length > 0;
}

export async function synthesize(
  env: Env,
  input: SynthesizeInput,
): Promise<SynthesizeResult> {
  if (!env.fishAudio.apiKey) {
    return { ok: false, httpStatus: 0, error: "FISH_AUDIO_API_KEY is not set." };
  }

  const text = input.text.trim();
  if (!text) return { ok: false, httpStatus: 0, error: "No text supplied." };
  if (text.length > 2000) {
    return {
      ok: false,
      httpStatus: 0,
      error: "Text exceeds 2,000 characters. Split the script into clips — it also sounds better.",
    };
  }

  const model = input.model ?? env.fishAudio.model;
  const payload: Record<string, unknown> = {
    text,
    format: input.format ?? "mp3",
    normalize: true,
    latency: input.latency ?? "normal",
  };

  const referenceId = input.referenceId ?? env.fishAudio.referenceId;
  if (referenceId) payload.reference_id = referenceId;
  if (input.format === "mp3" || !input.format) payload.mp3_bitrate = input.bitrate ?? 128;
  if (typeof input.temperature === "number") payload.temperature = input.temperature;

  let res: Response;
  try {
    res = await fetch(FISH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.fishAudio.apiKey}`,
        "Content-Type": "application/json",
        model,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(input.timeoutMs ?? SYNTHESIS_TIMEOUT_MS, SYNTHESIS_TIMEOUT_MS)),
    });
  } catch (error) {
    const err = error as Error & { cause?: { code?: string } };
    const reason =
      err.name === "TimeoutError" || err.name === "AbortError"
        ? `no response within ${SYNTHESIS_TIMEOUT_MS / 1000}s — request aborted.`
        : err.cause?.code
          ? `${err.message} (${err.cause.code})`
          : err.message;
    return { ok: false, httpStatus: 0, error: `Network failure reaching Fish Audio: ${reason}` };
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let message = raw.slice(0, 400);
    try {
      const parsed = JSON.parse(raw) as { message?: string; detail?: string };
      message = parsed.message ?? parsed.detail ?? message;
    } catch {
      /* keep raw text */
    }
    return {
      ok: false,
      httpStatus: res.status,
      error: message || `Fish Audio returned HTTP ${res.status}.`,
    };
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) {
    return { ok: false, httpStatus: res.status, error: "Fish Audio returned an empty stream." };
  }

  return {
    ok: true,
    bytes,
    contentType: res.headers.get("content-type") ?? "audio/mpeg",
  };
}
