import { isServerlessRuntime, SERVERLESS_STORAGE_WARNING } from "@/lib/storage-config";
import { credentialDiagnostics, getEnv } from "@/lib/env";
import { getProfile, profileCompleteness } from "@/lib/profile";
import { listCalls, listClips } from "@/lib/repo";
import { llmProvider } from "@/lib/llm";
import { isFishConfigured } from "@/lib/fishaudio";
import { json } from "@/lib/http";
import type { Capabilities } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Single source of truth for what is actually wired up. The UI never guesses,
 * and never claims ability the environment cannot back.
 */
export async function GET(): Promise<Response> {
  const env = getEnv();
  const [profile, calls, clips] = await Promise.all([getProfile(), listCalls(), listClips()]);
  const provider = llmProvider(env);

  const twilioMissing = [
    !env.twilio.accountSid && "TWILIO_ACCOUNT_SID",
    !env.twilio.authToken && "TWILIO_AUTH_TOKEN",
    !env.twilio.fromNumber && "TWILIO_FROM_NUMBER",
  ].filter(Boolean) as string[];

  const capabilities: Capabilities = {
    twilio: {
      ok: twilioMissing.length === 0,
      missing: twilioMissing,
      fromNumber: env.twilio.fromNumber || undefined,
    },
    fishAudio: {
      ok: isFishConfigured(env),
      missing: isFishConfigured(env) ? [] : ["FISH_AUDIO_API_KEY"],
      model: env.fishAudio.model,
    },
    llm: provider
      ? { ok: true, provider: provider.provider, model: provider.model }
      : { ok: false },
    liveCallsArmed: env.liveCallsArmed,
    webhookBaseUrl: env.publicBaseUrl || "(derived from request host)",
    dataDir: env.dataDir,
  };

  const liveCalls = calls.filter((c) => c.mode === "live");
  const since24h = Date.now() - 86_400_000;

  return json({
    ok: true,
    capabilities,
    storage: { temporary: isServerlessRuntime(), warning: isServerlessRuntime() ? SERVERLESS_STORAGE_WARNING : null },
    credentials: credentialDiagnostics(env),
    profile: {
      label: profile.meta.label,
      placeholder: profile.meta.placeholder,
      version: profile.meta.version,
      completeness: profileCompleteness(profile),
    },
    counters: {
      calls: calls.length,
      liveCalls: liveCalls.length,
      liveCalls24h: liveCalls.filter((c) => Date.parse(c.createdAt) > since24h).length,
      dailyCap: Math.min(env.dailyCap, profile.compliance.dailyCap || env.dailyCap),
      clips: clips.length,
    },
  });
}
