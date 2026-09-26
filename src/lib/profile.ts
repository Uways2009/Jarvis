import { readJson, writeJson, nowIso } from "./store";
import type { BusinessProfile } from "./types";

/**
 * The business brain.
 *
 * `SEEDED_PROFILE` is a worked example so the console is useful the moment it
 * boots. It is labelled, bannered in the UI, and replaced wholesale the first
 * time you save a real profile. Treat it as a schema reference, not as truth.
 */

export const SEEDED_PROFILE: BusinessProfile = {
  meta: {
    version: 1,
    updatedAt: nowIso(),
    seeded: true,
    label: "Example profile — replace me",
  },
  company: {
    name: "Meridian Operations Group",
    oneLiner:
      "We install the revenue operations infrastructure that lets B2B teams grow without adding headcount.",
    category: "Revenue operations & automation consultancy",
    website: "https://example.com",
    hq: "Lagos, Nigeria",
    timezone: "Africa/Lagos",
    founded: "2019",
    size: "12 people, 40+ engagements",
  },
  sender: {
    name: "Alex Adeyemi",
    role: "Principal",
    callbackNumber: "",
    email: "alex@example.com",
  },
  positioning: {
    elevatorPitch:
      "Most B2B teams do not have a demand problem — they have a leakage problem. We map the funnel end to end, instrument it, and remove the three or four places where qualified pipeline quietly dies. Typical result is 20–35% more booked meetings from the same spend, in one quarter.",
    valueProps: [
      "Pipeline you can see: one source of truth from first touch to closed won, no spreadsheet archaeology.",
      "Fewer tools, not more — we consolidate and instrument what you already pay for before recommending anything new.",
      "Operator-led delivery: the people who design the system are the people who build it.",
      "Fixed-scope first engagement, so you can judge us on a live result rather than a deck.",
    ],
    differentiators: [
      "We are measured on booked pipeline, not on activity metrics or hours billed.",
      "90-day engagements with a written exit plan and the documentation handed over.",
      "No reseller margin — we do not take vendor kickbacks, so our stack advice is clean.",
    ],
    proofPoints: [
      {
        id: "pp_1",
        label: "Series A SaaS, 22-person sales team",
        detail:
          "Rebuilt lead routing and lifecycle stages; removed two manual handoff steps that were dropping 31% of inbound.",
        metric: "+34% booked meetings in 11 weeks",
      },
      {
        id: "pp_2",
        label: "B2B services firm, £8M revenue",
        detail:
          "Consolidated 5 tools into 2, instrumented attribution, and gave the founders a single weekly pipeline view.",
        metric: "Reporting time cut from 6 hours to 20 minutes per week",
      },
      {
        id: "pp_3",
        label: "Mid-market fintech",
        detail:
          "Rebuilt outbound sequencing with cleaner targeting and better enrichment data.",
        metric: "Reply rate 2.1% → 6.8%",
      },
    ],
  },
  services: [
    {
      id: "svc_ops_audit",
      name: "Revenue Operations Audit",
      summary:
        "A two-week forensic teardown of your funnel: data quality, handoffs, routing rules, attribution, and the manual work hiding inside them.",
      outcomes: [
        "A ranked list of where pipeline is leaking, with numbers attached",
        "A 90-day remediation plan you can execute with or without us",
        "A clean data model from first touch to closed won",
      ],
      qualifiers: [
        "leads not being followed up",
        "no visibility into the funnel",
        "CRM is a mess",
        "attribution is guesswork",
        "manual handoffs between sales and marketing",
      ],
      priceAnchor: "Fixed fee, from $6,000",
    },
    {
      id: "svc_automation",
      name: "Funnel Automation Build",
      summary:
        "We build the plumbing: routing, enrichment, sequencing, lifecycle automation, and the dashboards that tell you the truth on Monday morning.",
      outcomes: [
        "Instant lead routing with no manual triage",
        "Sequences that write themselves from your CRM state",
        "One dashboard the whole revenue team trusts",
      ],
      qualifiers: [
        "spending hours on manual follow-up",
        "team too small to hire an ops person",
        "outbound reply rates falling",
        "onboarding new reps takes too long",
      ],
      priceAnchor: "From $12,000, 6–10 weeks",
    },
    {
      id: "svc_fractional_revops",
      name: "Fractional RevOps Partnership",
      summary:
        "Ongoing operating partner: monthly review, continuous improvement, and a senior ops brain without a full-time salary.",
      outcomes: [
        "Continuous iteration instead of a one-off project",
        "Someone accountable for the numbers between the systems",
        "Quarterly roadmap tied to revenue targets",
      ],
      qualifiers: [
        "no dedicated ops hire yet",
        "growing headcount quickly",
        "board is asking for better forecasting",
      ],
      priceAnchor: "From $3,500/month, 6-month minimum",
    },
  ],
  pricing: {
    model: "Fixed-scope projects, then optional monthly partnership",
    anchor:
      "Audits start at $6,000 and pay for themselves if they recover a single mid-market deal.",
    tiers: [
      {
        id: "tier_audit",
        name: "Audit",
        price: "$6,000",
        cadence: "one-off, 2 weeks",
        includes: ["Funnel teardown", "Data quality report", "90-day plan"],
        bestFor: "Teams who suspect leakage but cannot see it",
      },
      {
        id: "tier_build",
        name: "Build",
        price: "from $12,000",
        cadence: "6–10 weeks",
        includes: ["Everything in Audit", "Implementation", "Team training", "Handover docs"],
        bestFor: "Teams ready to fix it properly",
      },
      {
        id: "tier_partner",
        name: "Partner",
        price: "from $3,500/mo",
        cadence: "6-month minimum",
        includes: ["Monthly operating review", "Continuous improvement", "Quarterly roadmap"],
        bestFor: "Companies scaling past their processes",
      },
    ],
    commercialNotes:
      "We do not discount, but we will scope down. First engagement is always fixed-scope.",
  },
  icp: {
    segments: [
      {
        name: "Funded B2B SaaS, Series A–B",
        description:
          "Growing headcount fast, sales process outgrowing itself, no dedicated RevOps hire yet.",
        sizeRange: "20–120 employees",
        triggers: [
          "Just hired a VP Sales or first sales leader",
          "Raised a round in the last 6 months",
          "SDR team of 3–10 running out of inbound",
        ],
      },
      {
        name: "B2B services firms, $3M–$20M revenue",
        description:
          "Founder-led sales moving to a team; pipeline lives in the founders' heads and a spreadsheet.",
        triggers: [
          "Hiring the first non-founder salesperson",
          "Missing revenue targets two quarters running",
          "Marketing spend increasing with flat results",
        ],
      },
    ],
    decisionMakers: [
      "VP Sales / CRO",
      "Head of Growth or Marketing",
      "COO",
      "Founder / CEO (under 40 people)",
    ],
    disqualifiers: [
      "Pre-revenue or pre-product-market-fit",
      "Fewer than 5 people touching the funnel",
      "Looking for the cheapest possible contractor",
      "Enterprise with a 15-person RevOps department",
    ],
    buyingSignals: [
      "Job posting for a RevOps or Sales Ops role",
      "Recent funding announcement",
      "New sales leader in seat under 90 days",
      "Complaining publicly about CRM or attribution",
    ],
  },
  objections: [
    {
      objection: "We already have someone handling this internally.",
      reframe:
        "Good — that is usually who calls us. We are not replacing them; we give them the audit and the build so they stop firefighting. Most internal owners use us as the delivery team for the thing they have been asking for budget to do.",
    },
    {
      objection: "It is too expensive right now.",
      reframe:
        "Understood. The question I would ask is what a single mid-market deal is worth to you — the audit is priced below one. If we cannot find more than the fee in leakage, you should not work with us, and the plan is yours to keep either way.",
    },
    {
      objection: "We do not have time for a project right now.",
      reframe:
        "The audit runs in two weeks and needs about four hours of your team's time in total, mostly in one session. The rest is us reading your systems. That four hours is the trade for not spending the next two quarters guessing.",
    },
    {
      objection: "How do we know this works for a company like ours?",
      reframe:
        "Fair challenge. The closest comparison is a Series A SaaS team about your size that was dropping a third of inbound at handoff — that one came out at plus 34% booked meetings in eleven weeks. I can walk you through exactly what we changed.",
    },
    {
      objection: "Send me some information.",
      reframe:
        "Happy to — but a generic deck will waste your time. Give me two minutes now on where the funnel hurts most, and I will send the one page that actually maps to it.",
    },
  ],
  voice: {
    tone: [
      "Composed and unhurried",
      "Concrete over clever — numbers, not adjectives",
      "Curious, asks before asserting",
    ],
    banned: [
      "synergy",
      "revolutionary",
      "game-changing",
      "circle back",
      "touch base",
      "reach out",
      "I hope this email finds you well",
    ],
    signaturePhrase: "Does that land, or am I off track?",
  },
  goals: {
    primary: "Book 12 qualified discovery calls per month from outbound.",
    secondary: [
      "Convert 25% of audits into Build engagements",
      "Establish Meridian as the default RevOps partner for funded SaaS in West Africa and the UK",
    ],
    horizon: "This quarter",
    successMetric:
      "$80k of new signed contracts, at no more than 400 outbound attempts",
  },
  compliance: {
    aiDisclosure:
      "I should say up front — I am an AI assistant calling on behalf of Meridian. Happy to bring a human onto the line whenever you want one.",
    optOutLine:
      "If you would rather not hear from us again, say the word and I will remove your number today.",
    recordingNotice:
      "This call may be recorded for quality. If you would prefer that I not record, tell me now and I will stop.",
    quietHours: { start: 9, end: 18 },
    dailyCap: 25,
    cooldownHours: 24,
    suppressedNumbers: [],
    consentPolicy:
      "Business-to-business calls only, during local business hours. Honor opt-outs immediately and permanently. Disclose AI voice on every live call.",
  },
};

/**
 * One level of depth is all a profile patch ever needs: the collections are
 * arrays (replaced wholesale) and the nested objects are flat.
 */
export type ProfilePatch = {
  [K in keyof BusinessProfile]?: BusinessProfile[K] extends (infer U)[]
    ? U[]
    : BusinessProfile[K] extends object
      ? Partial<BusinessProfile[K]>
      : BusinessProfile[K];
};

/** Merge a stored profile over the schema so older files never break the app. */
export function mergeProfile(stored: ProfilePatch): BusinessProfile {
  const base = SEEDED_PROFILE;
  const merged = {
    ...base,
    ...stored,
    meta: { ...base.meta, ...(stored.meta ?? {}) },
    company: { ...base.company, ...(stored.company ?? {}) },
    sender: { ...base.sender, ...(stored.sender ?? {}) },
    positioning: {
      ...base.positioning,
      ...(stored.positioning ?? {}),
    },
    pricing: { ...base.pricing, ...(stored.pricing ?? {}) },
    icp: { ...base.icp, ...(stored.icp ?? {}) },
    voice: { ...base.voice, ...(stored.voice ?? {}) },
    goals: { ...base.goals, ...(stored.goals ?? {}) },
    compliance: { ...base.compliance, ...(stored.compliance ?? {}) },
    services: stored.services?.length ? stored.services : base.services,
    objections: stored.objections?.length ? stored.objections : base.objections,
  };
  return merged as BusinessProfile;
}

export async function getProfile(): Promise<BusinessProfile> {
  const stored = await readJson<ProfilePatch>("profile", {});
  return mergeProfile(stored);
}

export async function saveProfile(incoming: ProfilePatch): Promise<BusinessProfile> {
  const existing = await getProfile();

  // Merge first, then stamp the version — mutation happens on a fresh object,
  // never on the module-level seed.
  const next = mergeProfile({ ...existing, ...incoming });
  next.meta.version = (incoming.meta?.version ?? existing.meta.version) + 1;
  next.meta.updatedAt = nowIso();
  next.meta.seeded = incoming.meta?.seeded ?? false;
  next.meta.label = incoming.meta?.label ?? incoming.company?.name ?? existing.meta.label;

  await writeJson("profile", next);
  return next;
}

export interface Completeness {
  score: number;
  missing: string[];
}

/** How much of the brain is actually populated. Drives the UI meter. */
export function profileCompleteness(profile: BusinessProfile): Completeness {
  const missing: string[] = [];
  const has = (v: unknown) => {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    return Boolean(v);
  };

  const checks: [string, unknown][] = [
    ["Company name", profile.company.name],
    ["One-line description", profile.company.oneLiner],
    ["Elevator pitch", profile.positioning.elevatorPitch],
    ["Value propositions", profile.positioning.valueProps],
    ["Differentiators", profile.positioning.differentiators],
    ["Proof points", profile.positioning.proofPoints],
    ["Services", profile.services],
    ["Pricing tiers", profile.pricing.tiers],
    ["ICP segments", profile.icp.segments],
    ["Decision makers", profile.icp.decisionMakers],
    ["Objection plays", profile.objections],
    ["Tone guidance", profile.voice.tone],
    ["Primary goal", profile.goals.primary],
    ["AI disclosure line", profile.compliance.aiDisclosure],
    ["Caller identity", profile.sender.name],
    ["Callback number", profile.sender.callbackNumber],
  ];

  for (const [label, value] of checks) if (!has(value)) missing.push(label);

  const score = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return { score, missing };
}

/** Compact grounding text handed to the language model, when one is configured. */
export function profileDigest(profile: BusinessProfile): string {
  const services = profile.services
    .map((s) => `- ${s.name}: ${s.summary} Outcomes: ${s.outcomes.join("; ")}.`)
    .join("\n");
  const tiers = profile.pricing.tiers
    .map((t) => `- ${t.name} — ${t.price} (${t.cadence}): ${t.includes.join(", ")}`)
    .join("\n");
  const objections = profile.objections
    .map((o) => `- "${o.objection}" → ${o.reframe}`)
    .join("\n");
  const proof = profile.positioning.proofPoints
    .map((p) => `- ${p.label}: ${p.detail}${p.metric ? ` (${p.metric})` : ""}`)
    .join("\n");

  return [
    `COMPANY: ${profile.company.name} — ${profile.company.category}`,
    `ONE-LINER: ${profile.company.oneLiner}`,
    `PITCH: ${profile.positioning.elevatorPitch}`,
    `VALUE PROPS:\n${profile.positioning.valueProps.map((v) => `- ${v}`).join("\n")}`,
    `DIFFERENTIATORS:\n${profile.positioning.differentiators.map((v) => `- ${v}`).join("\n")}`,
    `SERVICES:\n${services}`,
    `PRICING (${profile.pricing.model}):\n${tiers}`,
    `PROOF:\n${proof}`,
    `OBJECTIONS:\n${objections}`,
    `ICP: ${profile.icp.segments.map((s) => s.name).join("; ")}`,
    `TONE: ${profile.voice.tone.join("; ")}. Never use: ${profile.voice.banned.join(", ")}.`,
    `GOAL: ${profile.goals.primary} (${profile.goals.horizon})`,
  ].join("\n\n");
}
