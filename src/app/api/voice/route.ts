import { getEnv } from "@/lib/env";
import { FISH_MODELS, isFishConfigured, synthesize } from "@/lib/fishaudio";
import { addClip, getScript, listClips, removeClip } from "@/lib/repo";
import { deleteAudioFile, newId, nowIso, saveAudioFile } from "@/lib/store";
import { estimateSeconds } from "@/lib/text";
import { json, readJsonBody } from "@/lib/http";
import type { VoiceClip } from "@/lib/types";

export const dynamic = "force-dynamic";

interface VoiceBody {
  text?: string;
  label?: string;
  scriptId?: string;
  /** Which part of a saved script to narrate. */
  field?: "readAloud" | "voicemail" | "smsFollowUp";
  model?: string;
  referenceId?: string;
  format?: "mp3" | "wav" | "opus" | "pcm";
  bitrate?: 64 | 128 | 192;
  temperature?: number;
}

export async function GET(): Promise<Response> {
  const env = getEnv();
  const clips = await listClips();
  return json({
    ok: true,
    clips,
    configured: isFishConfigured(env),
    models: FISH_MODELS,
    defaultModel: env.fishAudio.model,
    defaultReferenceId: env.fishAudio.referenceId,
  });
}

export async function POST(req: Request): Promise<Response> {
  const env = getEnv();
  const body = await readJsonBody<VoiceBody>(req);
  if (!body) return json({ ok: false, error: "Malformed JSON body." }, 400);

  let text = body.text?.trim() ?? "";
  let label = body.label?.trim() ?? "";

  if (!text && body.scriptId) {
    const script = await getScript(body.scriptId);
    if (!script) return json({ ok: false, error: "Script not found." }, 404);
    const field = body.field ?? "readAloud";
    text = field === "voicemail" ? script.voicemail : field === "smsFollowUp" ? script.smsFollowUp : script.readAloud;
    label = label || `${script.lead.name} · ${field}`;
  }

  if (!text) return json({ ok: false, error: "Nothing to synthesise." }, 400);
  if (!isFishConfigured(env)) {
    return json(
      {
        ok: false,
        error: "FISH_AUDIO_API_KEY is not configured. Add it to .env and restart.",
        missing: ["FISH_AUDIO_API_KEY"],
      },
      503,
    );
  }

  const result = await synthesize(env, {
    text,
    referenceId: body.referenceId,
    model: body.model,
    format: body.format,
    bitrate: body.bitrate,
    temperature: body.temperature,
  });

  if (!result.ok) {
    return json({ ok: false, error: result.error, httpStatus: result.httpStatus }, result.httpStatus === 0 ? 400 : 502);
  }

  const id = newId("clip");
  const format = body.format ?? "mp3";
  const file = await saveAudioFile(id, result.bytes, format);

  const clip: VoiceClip = {
    id,
    label: label || text.slice(0, 60),
    text,
    model: body.model ?? env.fishAudio.model,
    referenceId: body.referenceId ?? (env.fishAudio.referenceId || undefined),
    format,
    bitrate: body.bitrate,
    temperature: body.temperature,
    bytes: result.bytes.byteLength,
    estimatedSeconds: estimateSeconds(text),
    file,
    url: `/api/audio/${file}`,
    createdAt: nowIso(),
  };

  await addClip(clip);
  return json({ ok: true, clip });
}

export async function DELETE(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ ok: false, error: "id query parameter required." }, 400);
  const removed = await removeClip(id);
  if (!removed) return json({ ok: false, error: "Clip not found." }, 404);
  await deleteAudioFile(removed.file);
  return json({ ok: true, removed });
}
