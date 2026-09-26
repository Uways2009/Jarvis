import Link from "next/link";
import { getProfile } from "@/lib/profile";
import { listCalls, listScripts } from "@/lib/repo";
import { buildDrill, buildPreCallBrief, summarise } from "@/lib/briefing";
import { formatDuration, timeAgo } from "@/lib/text";
import { Card, CardHeader, Empty, Notice, Pill, SectionLabel, Stat } from "@/components/ui";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

const FOCI = [
  { id: "", label: "Everything" },
  { id: "objection", label: "Objections" },
  { id: "pricing", label: "Pricing pressure" },
  { id: "market", label: "Market fluency" },
  { id: "discovery", label: "Discovery" },
];

export default async function BriefingsPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus = "" } = await searchParams;
  const [profile, calls, scripts] = await Promise.all([getProfile(), listCalls(), listScripts()]);
  const activity = summarise(calls);

  const latest = scripts[0];
  const briefLead: Lead | null = latest
    ? latest.lead
    : profile.icp.segments[0]
      ? {
          name: "Next prospect",
          role: profile.icp.decisionMakers[0] ?? "",
          company: profile.icp.segments[0].name,
          industry: profile.company.category,
          need: profile.icp.segments[0].triggers[0] ?? "",
        }
      : null;

  const brief = briefLead ? buildPreCallBrief(profile, briefLead) : null;
  const drill = buildDrill(profile, focus, 6);

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber/80">Preparation</div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.02em]">Briefings</h1>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-mist-500">
          Two disciplines before the dial: know the account, and know your own material cold. The brief is
          generated from the profile; the drill is a mock interview that answers in your own words and marks
          the reasoning behind each answer.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Calls logged" value={activity.total} hint={`${activity.live} live · ${activity.blocked} blocked`} />
        <Stat label="Answered" value={activity.answered} hint="Prospect spoke on the call" />
        <Stat
          label="Avg. duration"
          value={formatDuration(activity.averageDurationSeconds ?? undefined)}
          hint={`${activity.completed} completed`}
        />
        <Stat
          label="Opt-outs honoured"
          value={activity.optOuts}
          hint="Suppressed permanently, same second"
          tone={activity.optOuts > 0 ? "amber" : "neutral"}
        />
      </div>

      {activity.topIntents.length ? (
        <Card>
          <CardHeader
            eyebrow="Signal"
            title="What prospects are actually saying"
            subtitle="Intent events captured by the live engine across every connected call."
          />
          <div className="flex flex-wrap gap-2">
            {activity.topIntents.map((intent) => (
              <span
                key={intent.intent}
                className="rounded-lg border border-line bg-ink-900 px-3 py-1.5 text-[12.5px] text-mist-300"
              >
                {intent.intent.replace(/_/g, " ")}{" "}
                <span className="font-mono text-mist-600">×{intent.count}</span>
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          eyebrow="Pre-call brief"
          title={brief?.headline ?? "No account loaded"}
          subtitle={
            latest
              ? `Derived from the script composed ${timeAgo(latest.createdAt)}.`
              : "Compose a script and the most recent prospect becomes the live brief."
          }
          actions={latest ? <Pill tone="neutral">{latest.objective.replace(/_/g, " ")}</Pill> : null}
        />
        {brief ? (
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <SectionLabel>Context</SectionLabel>
              <ul className="space-y-2">
                {brief.context.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[13px] leading-6 text-mist-300">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-signal/70" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-5">
              <div>
                <SectionLabel>Landmines</SectionLabel>
                <ul className="space-y-2">
                  {brief.landmines.map((line) => (
                    <li key={line} className="flex gap-2.5 text-[13px] leading-6 text-mist-300">
                      <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-danger/70" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <SectionLabel>Open with these</SectionLabel>
                <ul className="space-y-2">
                  {brief.questions.map((line) => (
                    <li key={line} className="flex gap-2.5 text-[13px] leading-6 text-mist-300">
                      <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-amber/70" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <Empty
            title="Nothing to brief on yet"
            body="Compose a call first, or populate the business brain so the brief has material to draw on."
            action={
              <Link href="/outreach" className="text-[13px] font-medium text-amber/90 hover:text-amber">
                Compose a call →
              </Link>
            }
          />
        )}
      </Card>

      <Card>
        <CardHeader
          eyebrow="Drill"
          title="Mock interview"
          subtitle="Answer each one out loud before you read the model. The gap between your answer and the model's is the whole point."
          actions={
            <div className="flex flex-wrap gap-1.5">
              {FOCI.map((option) => {
                const active = option.id === focus;
                return (
                  <Link
                    key={option.label}
                    href={option.id ? `/briefings?focus=${option.id}` : "/briefings"}
                    className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${
                      active
                        ? "border-amber/45 bg-amber-soft text-amber"
                        : "border-line text-mist-500 hover:text-mist-200"
                    }`}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          }
        />

        <Notice tone="info" title="How to use this">
          Answer aloud, in one breath, without reading. Then compare to the model. If your answer was longer
          than the model&apos;s, you are explaining rather than selling — cut it. If it was vaguer, you have
          found the hole in the profile, not in your delivery.
        </Notice>

        <div className="mt-4 space-y-4">
          {drill.map((item, index) => (
            <article key={index} className="rounded-xl border border-line-soft bg-ink-900/45">
              <header className="flex items-start gap-3 border-b border-line-soft px-4 py-3">
                <span className="mt-0.5 font-mono text-[12px] text-amber/80">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[14px] font-medium leading-6 text-mist-100">{item.question}</h3>
              </header>
              <div className="space-y-3 px-4 py-3.5">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist-600">
                    Model answer
                  </div>
                  <p className="teleprompter mt-1 text-mist-200">{item.model}</p>
                </div>
                <div className="rounded-lg border border-line-soft bg-panel/70 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber/70">
                    Why it lands
                  </div>
                  <p className="mt-1 text-[12.5px] leading-5 text-mist-400">{item.why}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
