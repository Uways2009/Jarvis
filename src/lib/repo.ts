import { mutateJson, readJson, newId } from "./store";
import type { CallRecord, ComposedScript, VoiceClip } from "./types";

/**
 * Repositories for the three runtime collections. Newest first on read,
 * hard-capped on write so the JSON store cannot grow without bound.
 */

const CALL_LIMIT = 500;
const CLIP_LIMIT = 200;
const SCRIPT_LIMIT = 300;

const byNewest = <T extends { createdAt: string }>(a: T, b: T) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt);

/* ── Calls ───────────────────────────────────────────────────────────────── */

export async function listCalls(): Promise<CallRecord[]> {
  const calls = await readJson<CallRecord[]>("calls", []);
  return [...calls].sort(byNewest);
}

export async function getCall(id: string): Promise<CallRecord | null> {
  const calls = await readJson<CallRecord[]>("calls", []);
  return calls.find((c) => c.id === id) ?? null;
}

export async function findCallBySid(sid: string): Promise<CallRecord | null> {
  const calls = await readJson<CallRecord[]>("calls", []);
  return calls.find((c) => c.sid === sid) ?? null;
}

export async function newCallRecord(
  seed: Omit<CallRecord, "id" | "createdAt" | "updatedAt" | "events" | "transcript"> & {
    events?: CallRecord["events"];
    transcript?: CallRecord["transcript"];
  },
): Promise<CallRecord> {
  const record: CallRecord = {
    ...seed,
    id: newId("call"),
    events: seed.events ?? [],
    transcript: seed.transcript ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await mutateJson<CallRecord[]>("calls", [], (calls) =>
    [record, ...calls].slice(0, CALL_LIMIT),
  );
  return record;
}

export async function updateCall(
  id: string,
  patch: Partial<CallRecord>,
): Promise<CallRecord | null> {
  let updated: CallRecord | null = null;
  await mutateJson<CallRecord[]>("calls", [], (calls) =>
    calls.map((call) => {
      if (call.id !== id) return call;
      updated = { ...call, ...patch, updatedAt: new Date().toISOString() };
      return updated;
    }),
  );
  return updated;
}

export async function mutateCallBySid(
  sid: string,
  fn: (call: CallRecord) => CallRecord,
): Promise<CallRecord | null> {
  let updated: CallRecord | null = null;
  await mutateJson<CallRecord[]>("calls", [], (calls) =>
    calls.map((call) => {
      if (call.sid !== sid) return call;
      updated = { ...fn(call), updatedAt: new Date().toISOString() };
      return updated;
    }),
  );
  return updated;
}

export async function appendTranscript(
  sid: string,
  entries: CallRecord["transcript"],
): Promise<CallRecord | null> {
  return mutateCallBySid(sid, (call) => ({
    ...call,
    transcript: [...call.transcript, ...entries],
  }));
}

/* ── Voice clips ─────────────────────────────────────────────────────────── */

export async function listClips(): Promise<VoiceClip[]> {
  const clips = await readJson<VoiceClip[]>("clips", []);
  return [...clips].sort(byNewest);
}

export async function getClip(id: string): Promise<VoiceClip | null> {
  const clips = await readJson<VoiceClip[]>("clips", []);
  return clips.find((c) => c.id === id) ?? null;
}

export async function addClip(clip: VoiceClip): Promise<VoiceClip> {
  await mutateJson<VoiceClip[]>("clips", [], (clips) => [clip, ...clips].slice(0, CLIP_LIMIT));
  return clip;
}

export async function removeClip(id: string): Promise<VoiceClip | null> {
  let removed: VoiceClip | null = null;
  await mutateJson<VoiceClip[]>("clips", [], (clips) =>
    clips.filter((clip) => {
      if (clip.id === id) {
        removed = clip;
        return false;
      }
      return true;
    }),
  );
  return removed;
}

/* ── Scripts ─────────────────────────────────────────────────────────────── */

export async function saveScript(script: ComposedScript): Promise<ComposedScript> {
  await mutateJson<ComposedScript[]>("scripts", [], (scripts) =>
    [script, ...scripts].slice(0, SCRIPT_LIMIT),
  );
  return script;
}

export async function getScript(id: string): Promise<ComposedScript | null> {
  const scripts = await readJson<ComposedScript[]>("scripts", []);
  return scripts.find((s) => s.id === id) ?? null;
}

export async function listScripts(): Promise<ComposedScript[]> {
  const scripts = await readJson<ComposedScript[]>("scripts", []);
  return [...scripts].sort(byNewest);
}
