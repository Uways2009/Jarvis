import Link from "next/link";
import { getEnv } from "@/lib/env";
import { getProfile, profileCompleteness } from "@/lib/profile";
import { listCalls, listClips } from "@/lib/repo";
import { summarise } from "@/lib/briefing";
import { llmProvider } from "@/lib/llm";
import { isFishConfigured } from "@/lib/fishaudio";
import { formatDuration, timeAgo } from "@/lib/text";
import { Card, CardHeader, Dot, Empty, Meter, Notice, Pill, SectionLabel, Stat, type Tone } from "@/components/ui";

export const dynamic = "force-dynamic";

function statusTone(status: string): Tone {
  switch (status) {
    case "completed":
      return "signal";
    case "failed":
    case "busy":
    case "no-answer":
      return "danger";
    case "dry_run":
      return "info";
    default:
      return "amber";
  }
}

export default async function ConsolePage() {
  const env = getEnv();
  const [profile, calls, clips] = await Promise.all([getProfile(), listCalls(), listClips()]);
  const completeness = profileCompleteness(profile);
  const activity = summarise(calls);
  const provider = llmProvider(env);

  const twilioMissing = [
    !env.twilio.accountSid && "TWILIO_ACCOUNT_SID",
    !env.twilio.authToken && "TWILIO_AUTH_TOKEN",
    !env.twilio.fromNumber && "TWILIO_FROM_NUMBER",
  ].filter(Boolean) as string[];

  const integrations = [
    {
      name: "Twilio Programmable Voice",
      ok: twilioMissing.length === 0,
      detail:
        twilioMissing.length === 0
          ? `Caller ID ${env.twilio.fromNumber} · signature validation ${env.twilio.validateSignature ? "on" : "OFF"}`
          : `Missing ${twilioMissing.join(", ")} in .env`,
    },
    {
      name: "Fish Audio TTS",
      ok: isFishConfigured(env),
      detail: isFishConfigured(env)
        ? `Model ${env.fishAudio.model}${env.fishAudio.referenceId ? " · custom voice bound" : " · platform default voice"}`
        : "Missing FISH_AUDIO_API_KEY in .env",
    },
    {
      name: "Language-model polish",
      ok: Boolean(provider),
      detail: provider
        ? `${provider.provider} · ${provider.model}`
        : "No GEMINI_API_KEY or OPENAI_API_KEY — the deterministic engine runs alone, which is fully supported.",
    },
    {
      name: "Webhook reachability",
      ok: Boolean(env.publicBaseUrl),
      detail: env.publicBaseUrl
        ? env.publicBaseUrl
        : "PUBLIC_BASE_URL unset — Twilio will not be able to fetch TwiML from a local or preview host.",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber/80">
            Operations console
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.02em] text-mist-100">
            {profile.meta.placeholder ? "Populate the brain, then dial" : `${profile.company.name}`}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-6 text-mist-500">
            {profile.company.oneLiner}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={env.liveCallsArmed ? "danger" : "signal"}>
            <Dot tone={env.liveCallsArmed ? "danger" : "signal"} />
            {env.liveCallsArmed ? "Live dialing armed" : "Dry-run only"}
          </Pill>
          <Pill tone="neutral">Profile v{profile.meta.version}</Pill>
        </div>
      </header>

      {profile.meta.placeholder ? (
        <Notice tone="danger" title="No business profile yet">
          The console ships with an empty skeleton and no invented facts. Composition and dispatch stay
          blocked until you describe your business — services, positioning, and how you price.{" "}
          <Link href="/profile" className="font-medium text-danger underline decoration-danger/40 underline-offset-2">
            Open the Business Brain →
          </Link>
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Live calls / 24h"
          value={`${activity.live > 0 ? calls.filter((c) => c.mode === "live" && Date.parse(c.createdAt) > Date.now() - 86_400_000).length : 0}/${Math.min(env.dailyCap, profile.compliance.dailyCap || env.dailyCap)}`}
          hint="Ceiling enforced by the safety gate"
          tone="amber"
        />
        <Stat label="Calls logged" value={activity.total} hint={`${activity.blocked} blocked pre-flight`} />
        <Stat
          label="Avg. duration"
          value={formatDuration(activity.averageDurationSeconds ?? undefined)}
          hint={`${activity.completed} completed`}
        />
        <Stat label="Voice clips" value={clips.length} hint={isFishConfigured(env) ? "Fish Audio ready" : "Needs a key"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader
            eyebrow="Readiness"
            title="What is actually wired"
            subtitle="The console never claims a capability the environment cannot back. Fix the gaps and the surfaces light up."
          />
          <ul className="space-y-3">
            {integrations.map((item) => (
              <li key={item.name} className="flex items-start gap-3">
                <span className="mt-1.5">
                  <Dot tone={item.ok ? "signal" : "danger"} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-mist-200">{item.name}</div>
                  <div className="mt-0.5 font-mono text-[11.5px] leading-4 text-mist-600">{item.detail}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl border border-line-soft bg-ink-900/60 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mist-600">
                Business brain completeness
              </span>
              <span className="font-mono text-[13px] text-mist-200">{completeness.score}%</span>
            </div>
            <Meter value={completeness.score} />
            {completeness.missing.length ? (
              <p className="mt-2.5 text-[12.5px] leading-5 text-mist-500">
                Missing: {completeness.missing.slice(0, 6).join(" · ")}
                {completeness.missing.length > 6 ? ` · +${completeness.missing.length - 6} more` : ""}
              </p>
            ) : (
              <p className="mt-2.5 text-[12.5px] text-signal">Complete. Composition will be specific.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            eyebrow="Sequence"
            title="The operating loop"
            subtitle="Four moves, in order. Skipping the first one is how outbound gets a bad name."
          />
          <ol className="space-y-4">
            {[
              {
                n: "01",
                title: "Populate the brain",
                body: "Services, pricing, proof, objections, tone. Everything downstream is derived from this.",
                href: "/profile",
                cta: "Business Brain",
              },
              {
                n: "02",
                title: "Compose the call",
                body: "Match the service to the stated need, then build opener, discovery, value and close.",
                href: "/outreach",
                cta: "Compose",
              },
              {
                n: "03",
                title: "Rehearse as a dry run",
                body: "Full dispatch path, zero carrier leg. Read the verdict, then fix what it flags.",
                href: "/calls",
                cta: "Dispatch desk",
              },
              {
                n: "04",
                title: "Arm, then dial",
                body: "Set NEXOVIRA_LIVE_CALLS=armed and type the authorisation phrase. Disclosure reads first.",
                href: "/calls",
                cta: "Arm and dial",
              },
            ].map((step) => (
              <li key={step.n} className="flex gap-3.5">
                <span className="mt-0.5 font-mono text-[12px] text-amber/80">{step.n}</span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-mist-200">{step.title}</div>
                  <p className="mt-0.5 text-[12.5px] leading-5 text-mist-500">{step.body}</p>
                  <Link
                    href={step.href}
                    className="mt-1.5 inline-block text-[12px] font-medium text-amber/90 underline decoration-amber/30 underline-offset-2 hover:text-amber"
                  >
                    {step.cta} →
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card>
        <CardHeader
          eyebrow="Activity"
          title="Recent calls"
          subtitle="Every dispatch, refusals included. An audit trail that omits the refusals is theatre."
          actions={
            <Link href="/calls" className="text-[12.5px] font-medium text-amber/90 hover:text-amber">
              Dispatch desk →
            </Link>
          }
        />
        {calls.length === 0 ? (
          <Empty
            title="No calls logged yet"
            body="Compose a script, then rehearse it as a dry run to see the full dispatch path without dialling anyone."
            action={
              <Link
                href="/outreach"
                className="rounded-lg border border-amber/40 bg-amber-soft px-3.5 py-2 text-[13px] font-medium text-amber hover:bg-amber/20"
              >
                Compose a call
              </Link>
            }
          />
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-mist-600">
                  <th className="px-2 pb-2 font-semibold">When</th>
                  <th className="px-2 pb-2 font-semibold">To</th>
                  <th className="px-2 pb-2 font-semibold">Prospect</th>
                  <th className="px-2 pb-2 font-semibold">Mode</th>
                  <th className="px-2 pb-2 font-semibold">Status</th>
                  <th className="px-2 pb-2 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {calls.slice(0, 7).map((call) => (
                  <tr key={call.id} className="text-mist-300">
                    <td className="px-2 py-2.5 whitespace-nowrap text-mist-500">{timeAgo(call.createdAt)}</td>
                    <td className="px-2 py-2.5 font-mono text-[12px]">{call.to}</td>
                    <td className="px-2 py-2.5">
                      {call.lead?.name ? `${call.lead.name}${call.lead.company ? ` · ${call.lead.company}` : ""}` : "—"}
                    </td>
                    <td className="px-2 py-2.5">
                      <Pill tone={call.mode === "live" ? "amber" : "neutral"}>{call.mode === "live" ? "live" : "dry run"}</Pill>
                    </td>
                    <td className="px-2 py-2.5">
                      <Pill tone={statusTone(call.status)}>{call.status.replace("-", " ")}</Pill>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[12px] text-mist-500">
                      {formatDuration(call.durationSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>Standing doctrine</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Disclose the machine", body: profile.compliance.aiDisclosure || "No disclosure configured — fix this before dialling." },
            { title: "Honour the no", body: profile.compliance.optOutLine },
            { title: "Right hour, right number", body: `Calling window ${profile.compliance.quietHours.start}:00–${profile.compliance.quietHours.end}:00 (${profile.company.timezone}), one attempt per number per ${env.cooldownHours}h.` },
            { title: "Say only what is true", body: profile.compliance.consentPolicy },
          ].map((rule) => (
            <div key={rule.title} className="rounded-xl border border-line-soft bg-ink-900/50 p-4">
              <div className="text-[13px] font-semibold text-mist-200">{rule.title}</div>
              <p className="mt-1.5 text-[12.5px] leading-5 text-mist-500">{rule.body}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
