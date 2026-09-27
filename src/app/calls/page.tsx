"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Disclosure, Spinner, Tabs } from "@/components/ui-client";
import { Card, CardHeader, Dot, Empty, Field, Notice, Pill, Stat, type Tone } from "@/components/ui";
import type { CallRecord, Lead, ObjectiveId, VoiceClip } from "@/lib/types";
import { formatDuration, timeAgo } from "@/lib/text";

interface Verdict {
  armed: boolean;
  mode: "dry_run" | "live";
  allowed: boolean;
  blockers: string[];
  wouldBlockLive: string[];
  warnings: string[];
  checks: { label: string; ok: boolean; detail: string }[];
  normalizedTo: string;
}

interface ScriptSummary {
  id: string;
  createdAt: string;
  objective: ObjectiveId;
  lead: Lead;
  matchedService?: string;
  estimatedSeconds: number;
  generatedBy: string;
}

const OBJECTIVE_LABELS: Record<ObjectiveId, string> = {
  book_meeting: "Book a discovery meeting",
  book_demo: "Book a walkthrough",
  qualify: "Qualify fit and timing",
  reactivate: "Reopen a dormant thread",
  send_info: "Secure permission to send",
  event_invite: "Invite to an event",
};

function statusTone(status: string): Tone {
  if (status === "completed") return "signal";
  if (status === "failed" || status === "busy" || status === "no-answer") return "danger";
  if (status === "dry_run") return "info";
  return "amber";
}

export default function DispatchPage() {
  const [mode, setMode] = useState<"dry_run" | "live">("dry_run");
  const [to, setTo] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [record, setRecord] = useState(false);
  const [region, setRegion] = useState("");
  const [objective, setObjective] = useState<ObjectiveId>("book_meeting");
  const [leadName, setLeadName] = useState("");
  const [leadCompany, setLeadCompany] = useState("");
  const [leadRole, setLeadRole] = useState("");
  const [leadNeed, setLeadNeed] = useState("");
  const [timezone, setTimezone] = useState("");
  const [scriptId, setScriptId] = useState("");
  const [clipId, setClipId] = useState("");

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [armed, setArmed] = useState(false);
  const [phraseHint, setPhraseHint] = useState("AUTHORIZE CALL");
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [busy, setBusy] = useState<"preflight" | "dispatch" | null>(null);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const [callsRes, scriptsRes, voiceRes] = await Promise.all([
      fetch("/api/calls", { cache: "no-store" }),
      fetch("/api/scripts", { cache: "no-store" }),
      fetch("/api/voice", { cache: "no-store" }),
    ]);
    const callsData = (await callsRes.json()) as { calls: CallRecord[]; armed: boolean; confirmPhrase: string };
    const scriptsData = (await scriptsRes.json()) as { scripts: ScriptSummary[] };
    const voiceData = (await voiceRes.json()) as { clips: VoiceClip[] };

    setCalls(callsData.calls ?? []);
    setArmed(Boolean(callsData.armed));
    setPhraseHint(callsData.confirmPhrase ?? "AUTHORIZE CALL");
    setScripts(scriptsData.scripts ?? []);
    setClips(voiceData.clips ?? []);
  }, []);

  useEffect(() => {
    void refresh().catch((err: Error) => setMessage({ tone: "danger", text: err.message }));
  }, [refresh]);

  // A verdict belongs to the exact inputs checked, not the next number typed.
  useEffect(() => {
    setVerdict(null);
  }, [to, mode, confirmPhrase, record, region, objective, scriptId, clipId, leadName, leadCompany, leadRole, leadNeed, timezone]);

  const payload = () => ({
    to,
    mode,
    confirmPhrase,
    record,
    region: region || undefined,
    objective,
    scriptId: scriptId || undefined,
    clipId: clipId || undefined,
    lead: leadName || timezone || leadCompany || leadRole || leadNeed
      ? {
          name: leadName,
          role: leadRole,
          company: leadCompany,
          industry: "",
          need: leadNeed,
          timezone: timezone || undefined,
          phone: to,
        }
      : undefined,
  });

  async function preflight() {
    setBusy("preflight");
    setMessage(null);
    try {
      const res = await fetch("/api/calls/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = (await res.json()) as { ok: boolean; verdict?: Verdict; error?: string };
      if (data.verdict) setVerdict(data.verdict);
      else setMessage({ tone: "danger", text: data.error ?? "Pre-flight failed." });
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "Pre-flight failed. Please retry." });
    } finally {
      setBusy(null);
    }
  }

  async function dispatch() {
    setBusy("dispatch");
    setMessage(null);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = (await res.json()) as {
        ok: boolean;
        blocked?: boolean;
        verdict?: Verdict;
        record?: CallRecord;
        error?: string;
      };
      if (data.verdict) setVerdict(data.verdict);

      if (data.ok) {
        setMessage({
          tone: data.record?.mode === "live" ? "signal" : "info",
          text:
            data.record?.mode === "live"
              ? `Live call placed. Twilio SID ${data.record?.sid ?? "pending"} — status callbacks will update this log.`
              : "Dry run logged. Nothing was dialled; the exact call path is recorded below.",
        });
      } else if (data.blocked) {
        setMessage({ tone: "danger", text: `Refused to dial. ${data.verdict?.blockers.join(" ")}` });
      } else {
        setMessage({ tone: "danger", text: data.error ?? "Dispatch failed." });
      }
      await refresh();
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function callAction(id: string, action: "sync" | "hangup" | "suppress") {
    try {
      const res = await fetch(`/api/calls/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Call action failed.");
      await refresh();
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "Call action failed." });
    }
  }

  const selectedClip = clips.find((c) => c.id === clipId);
  const liveCalls24h = calls.filter(
    (c) => c.mode === "live" && Date.parse(c.createdAt) > Date.now() - 86_400_000,
  ).length;

  return (
    <div className="space-y-6">
      <Link href="/calls/test" className="inline-flex rounded-lg border border-amber/40 px-4 py-2 text-sm text-amber hover:bg-amber-soft">Phone test — rehearsal or real call on your own number →</Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber/80">Telephony</div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.02em]">Dispatch desk</h1>
          <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-mist-500">
            Every dispatch passes the safety gate: number hygiene, suppression, cooldown, daily ceiling,
            calling hours, credential readiness and an explicit authorisation phrase. A single blocker
            stops the dial.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={armed ? "danger" : "signal"}>
            <Dot tone={armed ? "danger" : "signal"} />
            {armed ? "Armed" : "Disarmed"}
          </Pill>
          <Pill tone="neutral">{liveCalls24h} live / 24h</Pill>
        </div>
      </header>

      {!armed ? (
        <Notice tone="info" title="Live dialling is disarmed">
          Dispatch runs end-to-end as a rehearsal and writes to the log — no carrier leg, no cost, no
          prospect disturbed. To enable real calls, set <span className="font-mono text-[12px]">NEXOVIRA_LIVE_CALLS=armed</span>{" "}
          in <span className="font-mono text-[12px]">.env</span> and restart. Live dispatch then also requires
          typing <span className="font-mono text-[12px]">{phraseHint}</span>.
        </Notice>
      ) : (
        <Notice tone="danger" title="Live dialling armed">
          Calls placed in this mode reach real people and bill your Twilio account. Disclosure reads first,
          opt-outs are honoured immediately, and the authorisation phrase is mandatory.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <Card className="lg:sticky lg:top-24 lg:self-start">
          <CardHeader
            eyebrow="Step 03"
            title="Place a call"
            actions={
              <Tabs
                tabs={[
                  { id: "dry_run", label: "Rehearsal" },
                  { id: "live", label: "Live" },
                ]}
                active={mode}
                onChange={setMode}
              />
            }
          />

          <div className="space-y-3.5">
            <Field label="Destination number" hint="Include + and country code (or 00 prefix). Spaces and brackets are accepted. Business numbers only.">
              <input
                className="field font-mono"
                type="tel"
                autoComplete="tel"
                placeholder="+14155551212"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prospect name">
                <input className="field" value={leadName} onChange={(e) => setLeadName(e.target.value)} />
              </Field>
              <Field label="Company">
                <input className="field" value={leadCompany} onChange={(e) => setLeadCompany(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <input className="field" value={leadRole} onChange={(e) => setLeadRole(e.target.value)} />
              </Field>
              <Field label="Their time zone">
                <input
                  className="field"
                  placeholder="Europe/London"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Stated need" hint="Used when composing a script on the fly.">
              <textarea
                className="field min-h-[64px] resize-y"
                value={leadNeed}
                onChange={(e) => setLeadNeed(e.target.value)}
              />
            </Field>

            <div>
              <span className="label">Objective</span>
              <select
                className="field"
                value={objective}
                onChange={(e) => setObjective(e.target.value as ObjectiveId)}
              >
                {Object.entries(OBJECTIVE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3">
              <Field label="Script" hint="Composed scripts are stored; reuse one or let the desk compose on the fly.">
                <select className="field" value={scriptId} onChange={(e) => setScriptId(e.target.value)}>
                  <option value="">Compose on the fly from the notes above</option>
                  {scripts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.lead.name} · {OBJECTIVE_LABELS[s.objective]} · {timeAgo(s.createdAt)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Voice clip" hint="When selected, the clip is played instead of synthesised speech.">
                <select className="field" value={clipId} onChange={(e) => setClipId(e.target.value)}>
                  <option value="">None — use device speech</option>
                  {clips.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label.slice(0, 54)} · {c.estimatedSeconds}s
                    </option>
                  ))}
                </select>
              </Field>
              {selectedClip ? (
                <audio controls src={selectedClip.url} className="w-full">
                  <track kind="captions" />
                </audio>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Region code" hint="Two-letter, for recording-consent warnings.">
                <input
                  className="field uppercase"
                  placeholder="CA"
                  maxLength={2}
                  value={region}
                  onChange={(e) => setRegion(e.target.value.toUpperCase())}
                />
              </Field>
              <div className="flex items-end">
                <label className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-ink-900 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-amber"
                    checked={record}
                    onChange={(e) => setRecord(e.target.checked)}
                  />
                  <span className="text-[12.5px] text-mist-300">Record the call</span>
                </label>
              </div>
            </div>

            {mode === "live" ? (
              <Field
                label="Authorisation phrase"
                hint={`Type exactly: ${phraseHint}`}
              >
                <input
                  className="field font-mono tracking-[0.08em]"
                  placeholder={phraseHint}
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                />
              </Field>
            ) : null}

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={preflight} disabled={!to || busy !== null}>
                {busy === "preflight" ? <Spinner /> : null}
                Run pre-flight
              </Button>
              <Button
                variant={mode === "live" ? "danger" : "primary"}
                className="flex-1"
                onClick={dispatch}
                disabled={!to || busy !== null}
              >
                {busy === "dispatch" ? <Spinner /> : null}
                {mode === "live" ? "Dial now" : "Log rehearsal"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

          {verdict ? (
            <Card>
              <CardHeader
                eyebrow="Safety gate"
                title={verdict.allowed ? verdict.mode === "live" ? "Cleared to dial" : "Ready to rehearse — no call" : "Refused"}
                subtitle={`Destination ${verdict.normalizedTo || "invalid"} · effective mode ${verdict.mode === "live" ? "live" : "rehearsal"}`}
                actions={
                  <Pill tone={verdict.allowed ? "signal" : "danger"}>
                    {verdict.allowed ? "allowed" : `${verdict.blockers.length} blocker(s)`}
                  </Pill>
                }
              />
              <ul className="divide-y divide-line-soft">
                {verdict.checks.map((check) => (
                  <li key={check.label} className="flex items-start gap-3 py-2.5">
                    <span className="mt-1.5">
                      <Dot tone={check.ok ? "signal" : "danger"} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-mist-200">{check.label}</div>
                      <div className="font-mono text-[11.5px] leading-4 text-mist-600">{check.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>

              {verdict.blockers.length ? (
                <div className="mt-3 space-y-2">
                  {verdict.blockers.map((blocker) => (
                    <Notice key={blocker} tone="danger">
                      {blocker}
                    </Notice>
                  ))}
                </div>
              ) : null}

              {verdict.mode === "dry_run" && verdict.wouldBlockLive.length ? (
                <div className="mt-3 space-y-2">
                  {verdict.wouldBlockLive.map((blocker) => (
                    <Notice key={blocker} tone="amber" title="Would block a live call">
                      {blocker}
                    </Notice>
                  ))}
                </div>
              ) : null}

              {verdict.warnings.length ? (
                <div className="mt-3 space-y-2">
                  {verdict.warnings.map((warning) => (
                    <Notice key={warning} tone="amber">
                      {warning}
                    </Notice>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : (
            <Card>
              <CardHeader
                eyebrow="Safety gate"
                title="No verdict yet"
                subtitle="Run a pre-flight to see all ten gates evaluated against this number, in this hour, with these credentials."
              />
              <Empty
                title="Pre-flight is free"
                body="It reads numbers, hours, suppression, ceilings and credentials — and writes nothing at all."
              />
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Logged" value={calls.length} />
            <Stat label="Live" value={calls.filter((c) => c.mode === "live").length} />
            <Stat
              label="Blocked"
              value={calls.filter((c) => c.blockedReason).length}
              tone={calls.some((c) => c.blockedReason) ? "amber" : "neutral"}
            />
          </div>

          <Card>
            <CardHeader
              eyebrow="Audit"
              title="Call log"
              subtitle="Transcripts, AMD outcomes, intent events and opt-outs. Nothing is quietly discarded."
              actions={
                <Button variant="ghost" className="text-[12.5px]" onClick={() => void refresh()}>
                  Refresh
                </Button>
              }
            />
            {calls.length === 0 ? (
              <Empty
                title="No dispatches yet"
                body="Rehearse a call to see the full record the log keeps."
                action={
                  <Link href="/outreach" className="text-[13px] font-medium text-amber/90 hover:text-amber">
                    Compose one first →
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {calls.slice(0, 12).map((call) => (
                  <article key={call.id} className="rounded-xl border border-line-soft bg-ink-900/45 p-4">
                    <header className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={call.mode === "live" ? "amber" : "neutral"}>
                          {call.mode === "live" ? "live" : "dry run"}
                        </Pill>
                        <Pill tone={statusTone(call.status)}>{call.status.replace("-", " ")}</Pill>
                        {call.answeredBy ? <Pill tone="info">{call.answeredBy}</Pill> : null}
                        <span className="font-mono text-[12px] text-mist-300">{call.to}</span>
                      </div>
                      <span className="text-[11.5px] text-mist-600">{timeAgo(call.createdAt)}</span>
                    </header>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-mist-500">
                      {call.lead?.name ? (
                        <span>
                          {call.lead.name}
                          {call.lead.company ? ` · ${call.lead.company}` : ""}
                        </span>
                      ) : null}
                      <span className="font-mono">{OBJECTIVE_LABELS[call.objective]}</span>
                      <span>Duration {formatDuration(call.durationSeconds)}</span>
                      {call.sid ? <span className="font-mono">{call.sid}</span> : null}
                      {call.recordingUrl ? <span className="text-info">recording</span> : null}
                    </div>

                    {call.blockedReason ? (
                      <p className="mt-2.5 rounded-lg border border-danger/25 bg-danger-soft/50 px-3 py-2 text-[12.5px] leading-5 text-danger/90">
                        {call.blockedReason}
                      </p>
                    ) : null}

                    {call.transcript.length ? (
                      <div className="mt-3">
                        <Disclosure summary={`Transcript · ${call.transcript.length} entries`}>
                          <div className="space-y-2.5">
                            {call.transcript.map((entry, i) => (
                              <div key={i} className="text-[12.5px] leading-5">
                                <span
                                  className={`mr-2 font-mono text-[11px] uppercase tracking-wider ${
                                    entry.speaker === "assistant"
                                      ? "text-amber/80"
                                      : entry.speaker === "prospect"
                                        ? "text-info"
                                        : "text-mist-600"
                                  }`}
                                >
                                  {entry.speaker}
                                </span>
                                <span className="text-mist-200">{entry.text}</span>
                              </div>
                            ))}
                          </div>
                        </Disclosure>
                      </div>
                    ) : null}

                    {call.events.length ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {call.events.slice(-6).map((event, i) => (
                          <span
                            key={i}
                            className="rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-[11px] text-mist-500"
                            title={event.detail}
                          >
                            {event.status}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <footer className="mt-3 flex flex-wrap gap-2">
                      {call.sid ? (
                        <>
                          <Button variant="ghost" className="text-[12px]" onClick={() => void callAction(call.id, "sync")}>
                            Sync status
                          </Button>
                          <Button variant="ghost" className="text-[12px]" onClick={() => void callAction(call.id, "hangup")}>
                            End call
                          </Button>
                        </>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="text-[12px] text-danger/90"
                        onClick={() => void callAction(call.id, "suppress")}
                      >
                        Suppress number
                      </Button>
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
