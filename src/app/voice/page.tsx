"use client";

import { useEffect, useRef, useState } from "react";
import { Button, CopyButton, Spinner } from "@/components/ui-client";
import { Card, CardHeader, Empty, Field, Notice, Pill } from "@/components/ui";
import type { VoiceClip } from "@/lib/types";

const EMOTION_TAGS = [
  "[warm]",
  "[confident]",
  "[curious]",
  "[chuckle]",
  "[emphasis]",
  "[pause]",
  "[sympathetic]",
];

interface ScriptSummary {
  id: string;
  createdAt: string;
  lead: { name: string; company: string };
  voicemail: string;
  readAloud: string;
  estimatedSeconds: number;
}

export default function VoiceLabPage() {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [model, setModel] = useState("s2.1-pro-free");
  const [models, setModels] = useState<string[]>(["s2.1-pro-free", "s2.1-pro", "s2-pro", "s1"]);
  const [referenceId, setReferenceId] = useState("");
  const [temperature, setTemperature] = useState(0.8);
  const [format, setFormat] = useState<"mp3" | "wav" | "opus">("mp3");
  const [bitrate, setBitrate] = useState<64 | 128 | 192>(128);
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [configured, setConfigured] = useState(true);
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [scriptId, setScriptId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "info" | "neutral"; text: string } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const load = async () => {
      const [voiceRes, scriptsRes] = await Promise.all([
        fetch("/api/voice", { cache: "no-store" }),
        fetch("/api/scripts", { cache: "no-store" }),
      ]);
      const voiceData = (await voiceRes.json()) as {
        clips: VoiceClip[];
        configured: boolean;
        models: string[];
        defaultModel: string;
        defaultReferenceId: string;
      };
      const scriptsData = (await scriptsRes.json()) as { scripts: ScriptSummary[] };

      setClips(voiceData.clips ?? []);
      setConfigured(Boolean(voiceData.configured));
      if (voiceData.models?.length) setModels(voiceData.models);
      if (voiceData.defaultModel) setModel(voiceData.defaultModel);
      if (voiceData.defaultReferenceId) setReferenceId(voiceData.defaultReferenceId);
      setScripts(scriptsData.scripts ?? []);
    };
    void load();
  }, []);

  function insertTag(tag: string) {
    const el = textarea.current;
    if (!el) {
      setText((prev) => `${prev} ${tag} `);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${tag} ${text.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + tag.length + 1;
    });
  }

  async function generate() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          label,
          model,
          referenceId: referenceId || undefined,
          temperature,
          format,
          bitrate: format === "mp3" ? bitrate : undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; clip?: VoiceClip; error?: string };
      if (!data.ok || !data.clip) {
        setMessage({ tone: "danger", text: data.error ?? "Synthesis failed." });
        return;
      }
      setClips((prev) => [data.clip!, ...prev]);
      setMessage({ tone: "info", text: `Rendered ${(data.clip.bytes / 1024).toFixed(0)} KB in ${model}.` });
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/voice?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setClips((prev) => prev.filter((clip) => clip.id !== id));
  }

  function loadFromScript() {
    const script = scripts.find((s) => s.id === scriptId);
    if (!script) return;
    setText(script.readAloud);
    setLabel(`${script.lead.name}${script.lead.company ? ` · ${script.lead.company}` : ""} — full call`);
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber/80">Synthesis</div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.02em]">Voice lab</h1>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-mist-500">
          Fish Audio renders the voice. Clips are stored locally and served over a stable path, so Twilio can
          <span className="font-mono text-[12px]"> &lt;Play&gt; </span>
          them straight into a live call. Bracket tags steer delivery — they travel with the text.
        </p>
      </header>

      {!configured ? (
        <Notice tone="amber" title="No Fish Audio key">
          Add <span className="font-mono text-[12px]">FISH_AUDIO_API_KEY</span> to{" "}
          <span className="font-mono text-[12px]">.env</span> and restart. Until then, dispatch falls back to
          device speech, which still works.
        </Notice>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(300px,360px)]">
        <Card>
          <CardHeader
            eyebrow="Script"
            title="Text to synthesise"
            subtitle="Write it the way you would say it. Deliberate pauses beat dense paragraphs."
          />

          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Load from a composed script">
                <select className="field" value={scriptId} onChange={(e) => setScriptId(e.target.value)}>
                  <option value="">Select a script…</option>
                  {scripts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.lead.name}
                      {s.lead.company ? ` · ${s.lead.company}` : ""} · {s.estimatedSeconds}s
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <Button variant="secondary" onClick={loadFromScript} disabled={!scriptId}>
                  Load
                </Button>
              </div>
            </div>

            <div>
              <span className="label">Delivery tags</span>
              <div className="flex flex-wrap gap-1.5">
                {EMOTION_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => insertTag(tag)}
                    className="rounded-md border border-line bg-ink-900 px-2 py-1 font-mono text-[11.5px] text-mist-400 transition-colors hover:border-amber/40 hover:text-amber"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label="Script text"
              hint={`${words} words · ${text.length}/2000 characters · roughly ${Math.round((words / 150) * 60)}s spoken`}
            >
              <textarea
                ref={textarea}
                className="field teleprompter min-h-[240px] resize-y"
                placeholder="[warm] Hi Jordan — Alex from Meridian. I know I'm calling out of the blue…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={generate}
                disabled={loading || !text.trim() || !configured}
              >
                {loading ? <Spinner /> : null}
                {loading ? "Rendering…" : "Generate audio"}
              </Button>
              <Button variant="ghost" onClick={() => setText("")} disabled={!text}>
                Clear
              </Button>
              <CopyButton value={text} label="Copy text" className="border border-line" />
            </div>
          </div>
        </Card>

        <Card className="lg:sticky lg:top-24 lg:self-start">
          <CardHeader eyebrow="Parameters" title="Voice and model" />
          <div className="space-y-3.5">
            <Field label="Model" hint="s2.1-pro-free is the same weights as s2.1-pro at no cost — use it while iterating.">
              <select className="field" value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reference voice ID" hint="The Voice model id from your Fish Audio voice URL. Blank uses the platform default.">
              <input
                className="field font-mono text-[12.5px]"
                placeholder="933563129e564b19a115bedd57b7406a"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
              />
            </Field>

            <Field label="Label" hint="Human label for the clip list.">
              <input
                className="field"
                placeholder="Voicemail drop v2"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>

            <Field label={`Temperature · ${temperature.toFixed(2)}`} hint="0.7–0.8 reads expressive but stable. Above 0.95 wanders.">
              <input
                type="range"
                min={0.1}
                max={1.2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-amber"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Format">
                <select
                  className="field"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as "mp3" | "wav" | "opus")}
                >
                  <option value="mp3">mp3</option>
                  <option value="wav">wav</option>
                  <option value="opus">opus</option>
                </select>
              </Field>
              <Field label="MP3 bitrate">
                <select
                  className="field"
                  value={bitrate}
                  disabled={format !== "mp3"}
                  onChange={(e) => setBitrate(Number(e.target.value) as 64 | 128 | 192)}
                >
                  <option value={64}>64 kbps</option>
                  <option value={128}>128 kbps</option>
                  <option value={192}>192 kbps</option>
                </select>
              </Field>
            </div>

            <p className="text-[12px] leading-5 text-mist-600">
              Speech is synthesised per character. The free tier is genuine — evaluate there before committing
              volume.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          eyebrow="Library"
          title="Generated clips"
          subtitle="Stored on disk under data/audio and served from /api/audio. Twilio can fetch these during a call."
          actions={<Pill tone="neutral">{clips.length} clips</Pill>}
        />
        {clips.length === 0 ? (
          <Empty title="No clips yet" body="Generate one above, or load a composed script and render its voicemail." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {clips.map((clip) => (
              <div key={clip.id} className="rounded-xl border border-line-soft bg-ink-900/45 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-mist-200">{clip.label}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-mist-600">
                      <span>{clip.model}</span>
                      <span>{clip.format}</span>
                      <span>{clip.estimatedSeconds}s est.</span>
                      <span>{(clip.bytes / 1024).toFixed(0)} KB</span>
                    </div>
                  </div>
                  <Button variant="ghost" className="text-[12px] text-danger/80" onClick={() => void remove(clip.id)}>
                    Delete
                  </Button>
                </div>

                <audio controls src={clip.url} className="mt-3 w-full">
                  <track kind="captions" />
                </audio>

                <p className="mt-2.5 line-clamp-3 text-[12.5px] leading-5 text-mist-500">{clip.text}</p>

                <div className="mt-2 flex items-center gap-2">
                  <CopyButton value={clip.url} label="Copy URL" className="border border-line" />
                  <a
                    href={clip.url}
                    download
                    className="rounded-lg border border-line px-3 py-2 text-[12px] text-mist-300 hover:text-mist-100"
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
