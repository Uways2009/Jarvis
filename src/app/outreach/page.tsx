"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, CopyButton, Spinner } from "@/components/ui-client";
import { Card, CardHeader, Empty, Field, Notice, Pill, SectionLabel } from "@/components/ui";
import type { ComposedScript, Lead, ObjectiveId } from "@/lib/types";
import { estimateSeconds, words } from "@/lib/text";

const OBJECTIVES: { id: ObjectiveId; label: string; hint: string }[] = [
  { id: "book_meeting", label: "Book a discovery meeting", hint: "Default. Two concrete times offered." },
  { id: "book_demo", label: "Book a walkthrough", hint: "When they need to see the thing." },
  { id: "qualify", label: "Qualify fit and timing", hint: "Short call, sharp questions, no pitch." },
  { id: "reactivate", label: "Reopen a dormant thread", hint: "Reference the history you already have." },
  { id: "send_info", label: "Secure permission to send", hint: "One page, not a deck." },
  { id: "event_invite", label: "Invite to an event", hint: "Low-commitment, high-signal." },
];

const EMPTY_LEAD: Lead = {
  name: "",
  role: "",
  company: "",
  industry: "",
  need: "",
  trigger: "",
  city: "",
  timezone: "",
  phone: "",
  notes: "",
};

export default function OutreachPage() {
  const [lead, setLead] = useState<Lead>(EMPTY_LEAD);
  const [objective, setObjective] = useState<ObjectiveId>("book_meeting");
  const [script, setScript] = useState<ComposedScript | null>(null);
  const [refined, setRefined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rehearsal, setRehearsal] = useState<string | null>(null);
  const [renderingClip, setRenderingClip] = useState(false);

  const set = <K extends keyof Lead>(key: K, value: Lead[K]) =>
    setLead((prev) => ({ ...prev, [key]: value }));

  const ready = lead.name.trim() !== "" && lead.need.trim() !== "";

  const liveSeconds = useMemo(
    () => (lead.need ? estimateSeconds(lead.need) : 0),
    [lead.need],
  );

  async function compose() {
    setLoading(true);
    setError(null);
    setRehearsal(null);
    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, objective }),
      });
      const data = (await res.json()) as { ok: boolean; script?: ComposedScript; refined?: boolean; error?: string };
      if (!res.ok || !data.script) {
        setError(data.error ?? "Composition failed.");
        setScript(null);
        return;
      }
      setScript(data.script);
      setRefined(Boolean(data.refined));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function rehearse() {
    if (!script) return;
    setRehearsal(null);
    const res = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: lead.phone || "+10000000000",
        mode: "dry_run",
        lead,
        objective,
        scriptId: script.id,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; blocked?: boolean; error?: string; verdict?: { blockers: string[] } };
    setRehearsal(
      data.ok
        ? "Rehearsal logged. Open the Dispatch desk to read the transcript path."
        : data.blocked
          ? `Blocked: ${data.verdict?.blockers.join(" ")}`
          : (data.error ?? "Rehearsal failed."),
    );
  }

  async function renderVoicemail() {
    if (!script) return;
    setRenderingClip(true);
    setRehearsal(null);
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id, field: "voicemail", label: `${script.lead.name} voicemail` }),
      });
      const data = (await res.json()) as { ok: boolean; clip?: { url: string }; error?: string };
      setRehearsal(
        data.ok && data.clip
          ? `Voicemail rendered — play it from the Voice Lab (${data.clip.url}).`
          : (data.error ?? "Voice render failed."),
      );
    } finally {
      setRenderingClip(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber/80">Composition</div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.02em]">Outreach</h1>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-mist-500">
          Describe the prospect&apos;s actual problem. The composer matches it against your services, mines
          the proof points, and builds a call you could read aloud without flinching. Vague inputs produce
          vague calls — it will refuse to guess.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <Card className="lg:sticky lg:top-24 lg:self-start">
          <CardHeader eyebrow="Step 01" title="Prospect and objective" />
          <div className="space-y-3.5">
            <Field label="Prospect name">
              <input
                className="field"
                placeholder="Jordan Ellis"
                value={lead.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <input
                  className="field"
                  placeholder="VP Sales"
                  value={lead.role}
                  onChange={(e) => set("role", e.target.value)}
                />
              </Field>
              <Field label="Company">
                <input
                  className="field"
                  placeholder="Northwind"
                  value={lead.company}
                  onChange={(e) => set("company", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Industry">
                <input
                  className="field"
                  placeholder="B2B SaaS"
                  value={lead.industry}
                  onChange={(e) => set("industry", e.target.value)}
                />
              </Field>
              <Field label="Time zone" hint="IANA, e.g. Europe/London">
                <input
                  className="field"
                  placeholder="Europe/London"
                  value={lead.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Stated need (required)"
              hint={`${words(lead.need)} words · ~${liveSeconds}s spoken if read verbatim`}
            >
              <textarea
                className="field min-h-[86px] resize-y"
                placeholder="Leads are not being followed up fast enough; CRM is unreliable; no visibility into the funnel."
                value={lead.need}
                onChange={(e) => set("need", e.target.value)}
              />
            </Field>
            <Field label="Trigger or buying signal" hint="Job posting, funding round, new sales leader — the reason you are calling today.">
              <input
                className="field"
                placeholder="Just posted a RevOps role"
                value={lead.trigger ?? ""}
                onChange={(e) => set("trigger", e.target.value)}
              />
            </Field>
            <Field label="Working notes" hint="Anything else true about them. Feeds service matching.">
              <textarea
                className="field min-h-[64px] resize-y"
                placeholder="Series A, 40 people, running HubSpot badly, two SDRs."
                value={lead.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
            <Field label="Number (optional)" hint="Needed only to rehearse or dispatch.">
              <input
                className="field font-mono"
                placeholder="+14155551212"
                value={lead.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>

            <div>
              <span className="label">Objective</span>
              <div className="grid gap-1.5">
                {OBJECTIVES.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setObjective(option.id)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      objective === option.id
                        ? "border-amber/45 bg-amber-soft"
                        : "border-line bg-ink-900 hover:border-mist-600/50"
                    }`}
                  >
                    <div className={`text-[13px] font-medium ${objective === option.id ? "text-amber" : "text-mist-200"}`}>
                      {option.label}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-mist-600">{option.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <Button variant="primary" className="w-full" disabled={!ready || loading} onClick={compose}>
              {loading ? <Spinner /> : null}
              {loading ? "Composing…" : "Compose the call"}
            </Button>
            {!ready ? (
              <p className="text-[12px] leading-5 text-mist-600">
                Name and stated need are mandatory. A generic pitch is worse than no call.
              </p>
            ) : null}
          </div>
        </Card>

        <div className="space-y-5">
          {error ? <Notice tone="danger" title="Composition refused">{error}</Notice> : null}
          {rehearsal ? <Notice tone="info" title="Action">{rehearsal}</Notice> : null}

          {!script ? (
            <Card>
              <Empty
                title="No script yet"
                body="Fill the prospect panel and compose. You will get a sectioned call — opener, discovery, value bridge, objection plays, close, voicemail and follow-up message — with delivery cues on every part."
              />
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader
                  eyebrow="Step 02"
                  title={`${script.lead.name}${script.lead.company ? ` · ${script.lead.company}` : ""}`}
                  subtitle={`Objective: ${OBJECTIVES.find((o) => o.id === script.objective)?.label}`}
                  actions={
                    <>
                      <Pill tone={refined ? "info" : "neutral"}>
                        {refined ? `Polished by ${script.llmModel ?? "LLM"}` : "Deterministic engine"}
                      </Pill>
                      <Pill tone="neutral">{script.estimatedSeconds}s read</Pill>
                    </>
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton
                    value={script.readAloud}
                    label="Copy read-aloud"
                    className="border border-line"
                  />
                  <Button variant="secondary" className="text-[12.5px]" onClick={rehearse} disabled={!lead.phone}>
                    Rehearse as dry run
                  </Button>
                  <Button
                    variant="secondary"
                    className="text-[12.5px]"
                    onClick={renderVoicemail}
                    disabled={renderingClip}
                  >
                    {renderingClip ? <Spinner /> : null}
                    Render voicemail audio
                  </Button>
                  <Link
                    href="/calls"
                    className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] text-mist-300 transition-colors hover:text-mist-100"
                  >
                    Send to dispatch →
                  </Link>
                </div>
                {lead.phone ? (
                  <p className="mt-2 text-[12px] text-mist-600">
                    Rehearsal runs the full safety gate against {lead.phone} and logs the outcome. Nothing is dialled.
                  </p>
                ) : (
                  <p className="mt-2 text-[12px] text-mist-600">
                    Add a number above to rehearse the dispatch gate.
                  </p>
                )}

                {script.matchedService ? (
                  <div className="mt-4 rounded-xl border border-line-soft bg-ink-900/60 p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-600">
                      Service match
                    </div>
                    <div className="mt-1 text-[13.5px] font-medium text-mist-200">
                      {script.matchedService.name}{" "}
                      <span className="font-mono text-[11.5px] text-mist-600">
                        score {script.matchedService.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-5 text-mist-500">{script.matchedService.rationale}</p>
                  </div>
                ) : (
                  <Notice tone="amber">
                    No service matched the stated need with confidence. Either the note is too thin, or this
                    prospect needs a service you have not documented — both are worth fixing before dialling.
                  </Notice>
                )}
              </Card>

              <Card>
                <SectionLabel>Call structure</SectionLabel>
                <div className="space-y-4">
                  {script.sections.map((section, index) => (
                    <article key={`${section.kind}-${index}`} className="rounded-xl border border-line-soft bg-ink-900/45">
                      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
                        <span className="text-[12.5px] font-semibold text-mist-200">{section.label}</span>
                        <Pill tone="neutral">{section.kind}</Pill>
                      </header>
                      <div className="px-4 py-3.5">
                        <div className="teleprompter space-y-2 text-mist-100">
                          {section.lines.map((line, i) => (
                            <p key={i}>{line}</p>
                          ))}
                        </div>
                        {section.cues?.length ? (
                          <ul className="mt-3 space-y-1.5 border-t border-line-soft pt-3">
                            {section.cues.map((cue, i) => (
                              <li key={i} className="flex gap-2 text-[12px] leading-5 text-mist-500">
                                <span className="text-amber/70">▸</span>
                                <span>{cue}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </Card>

              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <CardHeader
                    title="Voicemail drop"
                    actions={<CopyButton value={script.voicemail} label="Copy" />}
                  />
                  <p className="teleprompter text-mist-200">{script.voicemail}</p>
                </Card>
                <Card>
                  <CardHeader
                    title="Follow-up message"
                    actions={<CopyButton value={script.smsFollowUp} label="Copy" />}
                  />
                  <p className="teleprompter text-mist-200">{script.smsFollowUp}</p>
                </Card>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <CardHeader title="Delivery checklist" />
                  <ul className="space-y-2">
                    {script.checklist.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-[13px] leading-5 text-mist-300">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber/70" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card>
                  <CardHeader title="Never say" subtitle="Configured in the business brain, enforced here." />
                  <div className="flex flex-wrap gap-1.5">
                    {script.doNotSay.map((word) => (
                      <span
                        key={word}
                        className="rounded-md border border-danger/25 bg-danger-soft px-2 py-1 text-[12px] text-danger/90 line-through decoration-danger/40"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
