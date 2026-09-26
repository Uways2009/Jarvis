import type { BusinessProfile, CallRecord, Lead } from "./types";
import { overlapScore, stemSet } from "./text";

/**
 * Briefings — the tutoring surface.
 *
 * Two jobs: prepare a call that is about to happen, and drill the operator
 * until the material is reflexive. Both are generated from the same business
 * profile the dialler uses, so the rehearsal and the reality never diverge.
 */

export interface Brief {
  headline: string;
  context: string[];
  landmines: string[];
  questions: string[];
  objective: string;
}

export function buildPreCallBrief(profile: BusinessProfile, lead: Lead): Brief {
  const query = stemSet([lead.need, lead.notes ?? "", lead.trigger ?? "", lead.industry].join(" "));
  const ranked = [...profile.services]
    .map((service) => ({
      service,
      score: overlapScore(query, [service.name, service.summary, ...service.outcomes, ...service.qualifiers].join(" ")),
    }))
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0];
  const secondary = ranked[1];

  const proof = profile.positioning.proofPoints
    .map((p) => ({ p, score: overlapScore(query, `${p.label} ${p.detail}`) }))
    .sort((a, b) => b.score - a.score)[0]?.p;

  const segment = profile.icp.segments
    .map((s) => ({ s, score: overlapScore(query, `${s.name} ${s.description} ${s.triggers.join(" ")}`) }))
    .sort((a, b) => b.score - a.score)[0]?.s;

  return {
    headline: `${lead.name}${lead.role ? `, ${lead.role}` : ""}${lead.company ? ` at ${lead.company}` : ""}`,
    context: [
      lead.need ? `Stated need: ${lead.need}` : "No stated need — open with a hypothesis and let them correct it.",
      lead.trigger ? `Trigger to reference: ${lead.trigger}` : "",
      segment ? `Closest ICP segment: ${segment.name}` : "",
      primary?.score ? `Lead with: ${primary.service.name} — ${primary.service.priceAnchor ?? profile.pricing.anchor}` : `Lead with: ${profile.services[0]?.name ?? "your top service"}`,
      secondary?.score ? `Hold in reserve: ${secondary.service.name}` : "",
      proof ? `Proof to cite: ${proof.label} → ${proof.metric ?? proof.detail.slice(0, 80)}` : "",
    ].filter(Boolean),
    landmines: [
      ...profile.icp.disqualifiers.slice(0, 2).map((d) => `Disqualifier to test for: ${d}`),
      profile.voice.banned.length
        ? `Language to avoid: ${profile.voice.banned.slice(0, 5).join(", ")}`
        : "",
      "Do not quote a price you have not been authorised to quote.",
    ].filter(Boolean),
    questions: [
      lead.need ? `How long has "${lead.need.slice(0, 70)}" been true?` : "What made you take this call?",
      "Who owns this internally, and who signs off?",
      "What happens if nothing changes this quarter?",
      "What have you already tried?",
      `On a scale of one to ten, how urgent is this? (Then: what would make it a ten?)`,
    ],
    objective: profile.goals.primary,
  };
}

export interface DrillQuestion {
  question: string;
  model: string;
  why: string;
}

/** A mock-interview drill built from the operator's own material. */
export function buildDrill(profile: BusinessProfile, focus: string, count = 6): DrillQuestion[] {
  const key = focus.trim().toLowerCase();
  const pool: DrillQuestion[] = [];

  // 1 — Objections: the highest-value rep to rehearse.
  for (const play of profile.objections) {
    pool.push({
      question: play.objection,
      model: play.reframe,
      why: "Objection handling. Agree, reframe with a specific anchor, hand the turn back.",
    });
  }

  // 2 — Pricing pressure.
  const anchor = profile.pricing.anchor;
  pool.push({
    question: "What does this cost?",
    model: `${profile.pricing.model}. ${anchor} ${
      profile.pricing.tiers[0] ? `Entry point is ${profile.pricing.tiers[0].name} at ${profile.pricing.tiers[0].price}.` : ""
    } Then stop talking and let them respond.`,
    why: "Price questions are buying signals. Give one number, not a range, not an apology.",
  });

  // 3 — Credibility.
  const proof = profile.positioning.proofPoints[0];
  pool.push({
    question: `Why should we trust ${profile.company.name} with this?`,
    model: proof ? `${proof.label}: ${proof.detail}${proof.metric ? ` — ${proof.metric}.` : ""}` : profile.positioning.elevatorPitch,
    why: "Proof beats promise. One specific comparable, then stop.",
  });

  // 4 — Differentiation.
  pool.push({
    question: "How are you different from everyone else pitching us?",
    model: profile.positioning.differentiators.slice(0, 2).join(" "),
    why: "Differentiation must be structural (how you work), not adjectival (we're better).",
  });

  // 5 — Disqualification, asked the other way.
  pool.push({
    question: "Who is a bad fit for you?",
    model: profile.icp.disqualifiers.length
      ? `We turn away: ${profile.icp.disqualifiers.slice(0, 3).join("; ")}. Naming it proves you are selective.`
      : "Name a genuine bad fit. Refusing work is the strongest credibility signal available.",
    why: "Selectivity implies demand and protects delivery.",
  });

  // 6 — The ask.
  pool.push({
    question: "What happens on the call after this one?",
    model: `${profile.goals.primary} Next step is concrete: two proposed times, a named attendee, an agenda in writing.`,
    why: "A booking without a defined next step is a stalled deal wearing a calendar invite.",
  });

  // 7 — Market understanding.
  pool.push({
    question: `What is changing in ${profile.company.category.toLowerCase()} right now, and why does it matter to me?`,
    model: `${profile.icp.buyingSignals.slice(0, 2).join("; ")} — these signals are the market telling you the problem has become urgent.`,
    why: "Operators who can name the market's clock sound like peers, not vendors.",
  });

  const scored = key
    ? pool
        .map((entry) => ({
          entry,
          score: overlapScore(stemSet(key), `${entry.question} ${entry.model} ${entry.why}`),
        }))
        .sort((a, b) => b.score - a.score)
        .map((s) => s.entry)
    : pool;

  return scored.slice(0, count);
}

export interface ActivitySummary {
  total: number;
  live: number;
  answered: number;
  completed: number;
  blocked: number;
  averageDurationSeconds: number | null;
  optOuts: number;
  topIntents: { intent: string; count: number }[];
}

export function summarise(calls: CallRecord[]): ActivitySummary {
  const live = calls.filter((c) => c.mode === "live");
  const completed = live.filter((c) => c.status === "completed");
  const durations = completed
    .map((c) => c.durationSeconds)
    .filter((d): d is number => typeof d === "number" && d > 0);

  const intentCounts = new Map<string, number>();
  for (const call of calls) {
    for (const event of call.events) {
      if (event.status.startsWith("intent:")) {
        const key = event.status.replace("intent:", "");
        intentCounts.set(key, (intentCounts.get(key) ?? 0) + 1);
      }
    }
  }

  return {
    total: calls.length,
    live: live.length,
    answered: live.filter((c) => c.transcript.some((t) => t.speaker === "prospect")).length,
    completed: completed.length,
    blocked: calls.filter((c) => c.blockedReason).length,
    averageDurationSeconds: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    optOuts: calls.filter((c) => c.events.some((e) => e.status === "opt_out")).length,
    topIntents: [...intentCounts.entries()]
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
