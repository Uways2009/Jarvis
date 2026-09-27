"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Spinner, Tabs } from "@/components/ui-client";
import { Card, CardHeader, Field, Notice, Pill } from "@/components/ui";

type Call = { id: string; to: string; status: string; error?: string; hasSid: boolean; transcript: { speaker: string; text: string }[] };
const finished = new Set(["completed", "failed", "busy", "no-answer", "canceled"]);
const labels: Record<string, string> = { preparing: "Preparing call", queued: "Calling", initiated: "Calling", ringing: "Ringing", "in-progress": "In progress", completed: "Completed", failed: "Failed", busy: "Busy", "no-answer": "No answer", canceled: "Ended", unknown: "Unconfirmed — check Twilio Console" };

async function api(url: string, body?: unknown, method?: string) {
  const response = await fetch(url, { method: method || (body ? "POST" : "GET"), headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw Object.assign(new Error(data?.error || `Request failed (${response.status}). Please retry.`), { status: response.status });
  return data;
}

export default function PhoneTestPage() {
  const [mode, setMode] = useState<"rehearsal" | "live">("rehearsal");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("This is a phone integration test. Can you hear me clearly?");
  const [voice, setVoice] = useState("twilio");
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [consent, setConsent] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [call, setCall] = useState<Call | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [turn, setTurn] = useState(0);
  const [speech, setSpeech] = useState("");
  const [simStatus, setSimStatus] = useState("");
  const [transcript, setTranscript] = useState<{ speaker: string; text: string }[]>([]);
  const requestId = useRef("");
  const inFlight = useRef(false);
  const locked = busy || attempted || turn > 0;

  useEffect(() => {
    if (!call || finished.has(call.status)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await api(`/api/test-calls/${call.id}`);
        if (alive) setCall(data.call);
      } catch (err) { if (alive) setError((err as Error).message); }
      if (alive) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => { alive = false; clearTimeout(timer); };
  }, [call?.id, call?.status]);

  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { await task(); } catch (err) { setError((err as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function rehearse() {
    await run(async () => {
      const data = await api("/api/test-calls", { mode: "rehearsal", to, message, speech, turn });
      setTranscript(prev => [...prev, ...(turn ? [{ speaker: "You", text: speech || "(silence)" }] : []), { speaker: "Assistant", text: data.say }]);
      setSimStatus(data.status); setTurn(turn + 1); setSpeech("");
    });
  }
  async function dial() {
    await run(async () => {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      setAttempted(true);
      try {
        const data = await api("/api/test-calls", { mode: "live", to, message, voice, consent, confirmPhrase: phrase, requestId: requestId.current });
        setCall(data.call); setConfirming(false);
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        // These responses reject before a carrier request. Network/5xx failures
        // keep the request ID, since Twilio may already have accepted the call.
        if ([400, 401, 403, 429].includes(status || 0)) {
          setAttempted(false); requestId.current = "";
          if (status === 401) setUnlocked(false);
        }
        throw err;
      }
    });
  }
  function reset() {
    setAttempted(false); setCall(null); setTurn(0); setSimStatus(""); setTranscript([]);
    setPhrase(""); setConsent(false); setConfirming(false); setError(""); requestId.current = "";
  }
  const status = busy && attempted && !call ? "preparing" : call?.status || simStatus;
  return (
    <div className="space-y-6">
      <header>
        <Link href="/calls" className="text-sm text-amber">← Dispatch desk</Link>
        <h1 className="mt-3 text-[26px] font-semibold">Phone test</h1>
        <p className="mt-2 text-sm text-mist-500">Test your own phone with Nexovira. Rehearsal makes no external calls. Live mode uses Twilio and may incur charges.</p>
      </header>
      <Notice tone="info" title="Vercel-safe test flow">
        Live tests use shared Redis storage, not local files. Limited to configured test numbers, one attempt per minute and ten per 24 hours. Calls end after two minutes or four responses. No recording or human transfer.
      </Notice>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Prepare a test" eyebrow="Phone integration" />
          <div className="space-y-4">
            <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
              <Tabs tabs={[{ id: "rehearsal", label: "Rehearsal" }, { id: "live", label: "Live" }]} active={mode} onChange={(next) => { setMode(next); setConfirming(false); }} />
              <Field label="Your test phone number" hint="International format, including + and country code.">
                <input type="tel" autoComplete="tel" className="field" value={to} onChange={e => setTo(e.target.value)} placeholder="+2348012345678" />
              </Field>
              <Field label="Message to read aloud" hint="Read verbatim after the AI disclosure. Follow-up replies use Nexovira's existing intent engine, not a general-purpose LLM.">
                <textarea className="field min-h-28" maxLength={600} value={message} onChange={e => setMessage(e.target.value)} />
              </Field>
              <Field label="Live voice">
                <select className="field" value={voice} onChange={e => setVoice(e.target.value)}>
                  <option value="twilio">Twilio speech (fastest)</option>
                  <option value="fish">Fish Audio (Twilio fallback if unavailable)</option>
                </select>
              </Field>
            </fieldset>
            {mode === "live" && <div className="space-y-3 rounded-xl border border-line p-4">
              <div className="text-sm font-medium">Operator access</div>
              {!unlocked ? <>
                <Field label="Test operator password" hint="The password you configured in NEXOVIRA_TEST_PASSWORD — never enter Twilio credentials here.">
                  <input type="password" className="field" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
                </Field>
                <Button variant="secondary" disabled={busy || !password} onClick={() => void run(async () => { await api("/api/test-calls/session", { password }); setPassword(""); setUnlocked(true); })}>Unlock live testing</Button>
              </> : <div className="flex items-center justify-between"><Pill tone="signal">Operator unlocked</Pill><Button variant="ghost" disabled={busy} onClick={() => void run(async () => { await api("/api/test-calls/session", undefined, "DELETE"); setUnlocked(false); })}>Lock</Button></div>}
            </div>}
            {mode === "rehearsal" && !turn && <Button disabled={busy || !to.trim() || !message.trim()} onClick={() => void rehearse()}>{busy && <Spinner />}Start rehearsal</Button>}
            {mode === "live" && !call && <Button variant="danger" disabled={busy || !unlocked || !to.trim() || !message.trim()} onClick={() => setConfirming(true)}>{attempted ? "Review / recover request" : "Review live call"}</Button>}
            {confirming && !call && <div role="dialog" aria-label="Confirm live call" className="space-y-3 rounded-xl border border-danger/40 p-4">
              <Notice tone="amber">This will call <strong>{to}</strong> using Twilio. Carrier charges may apply. The server must be armed and this number must be allowlisted.</Notice>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I own this number or have the recipient&apos;s permission for this test.</label>
              <Field label="Type AUTHORIZE CALL exactly"><input className="field font-mono" value={phrase} onChange={e => setPhrase(e.target.value)} autoComplete="off" /></Field>
              <div className="flex gap-2"><Button variant="danger" disabled={busy || !consent || phrase !== "AUTHORIZE CALL"} onClick={() => void dial()}>{busy && <Spinner />}{attempted ? "Recover / retry same request" : "Place REAL call"}</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button></div>
            </div>}
            {(turn > 0 || (call && finished.has(call.status))) && <Button variant="secondary" disabled={busy} onClick={reset}>New test</Button>}
            {attempted && !call && !busy && <p className="text-xs text-mist-500">Retry recovers the same request and cannot create a second call. If the server rejected the number or configuration, correct the server settings before retrying. Reload only after checking Twilio Console for any unconfirmed call.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Test activity" eyebrow={mode === "live" ? "Carrier status" : "Simulation — no phone is dialled"} />
          <div className="space-y-4" aria-live="polite">
            <Pill tone={status === "failed" ? "danger" : "info"}>{labels[status] || "Ready"}</Pill>
            {error && <Notice tone="danger">{error}</Notice>}
            {call?.error && <Notice tone="danger">{call.error}</Notice>}
            {call && <div className="flex gap-2"><Button variant="secondary" disabled={busy || !call.hasSid} onClick={() => void run(async () => setCall((await api(`/api/test-calls/${call.id}`, { action: "sync" })).call))}>Sync with Twilio</Button><Button variant="danger" disabled={busy || !call.hasSid || finished.has(call.status)} onClick={() => void run(async () => setCall((await api(`/api/test-calls/${call.id}`, { action: "end" })).call))}>End call</Button></div>}
            {(call?.transcript || transcript).map((entry, i) => <div key={i} className="rounded-lg border border-line p-3 text-sm"><span className="mb-1 block text-xs text-amber">{entry.speaker}</span>{entry.text}</div>)}
            {mode === "rehearsal" && turn > 0 && simStatus !== "completed" && <div className="space-y-3"><Field label="Simulated spoken response" hint="Try “yes”, “who are you?”, or “stop”. Leave blank to simulate silence."><input className="field" value={speech} maxLength={500} onChange={e => setSpeech(e.target.value)} /></Field><Button disabled={busy} onClick={() => void rehearse()}>Send simulated reply</Button></div>}
            {!status && <p className="text-sm text-mist-500">Start a rehearsal or review a live call. A connected Twilio call will update here through signed status webhooks.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
