import { readJson, writeJson, nowIso } from "./store";
import type { BusinessProfile, ComposeReadiness } from "./types";

/**
 * The business brain.
 *
 * `BLANK_PROFILE` ships as an honest skeleton: real structure, real compliance
 * defaults, and no invented business facts. A fresh install knows nothing about
 * your company, and says so, rather than pitching a plausible-sounding fiction
 * to a real prospect. Populate it at /profile.
 *
 * Deliberately NOT pre-filled: services, pricing, proof points, positioning and
 * goals. Those are claims only you can make. The console's completeness meter
 * tracks exactly which ones are still missing.
 */
export const BLANK_PROFILE: BusinessProfile = {
  meta: {
    version: 0,
    updatedAt: nowIso(),
    placeholder: true,
    label: "Not yet populated",
  },
  company: {
    name: "",
    oneLiner: "",
    category: "",
    website: "",
    hq: "",
    // Defaulted to the common case rather than UTC, because calling hours are
    // evaluated against this and a wrong zone is a compliance problem.
    timezone: "Africa/Lagos",
    founded: "",
    size: "",
  },
  sender: {
    name: "",
    role: "",
    callbackNumber: "",
    email: "",
  },
  positioning: {
    elevatorPitch: "",
    valueProps: [],
    differentiators: [],
    proofPoints: [],
  },
  services: [],
  pricing: {
    model: "",
    anchor: "",
    tiers: [],
    commercialNotes: "",
    // Default to the more conservative posture: never quote unprompted.
    disclosure: "budget_led",
    currency: "",
    budgetPrompt:
      "We do not work from a fixed price list — we build to what you have set aside, so you get the most for it. What budget were you thinking for this?",
    noBudgetResponse:
      "That is fine. Tell me what you want the site to do, and I will send a short note with the options and what each would take. No obligation.",
    budgetBands: [],
    paymentTerms: "",
  },
  market: {
    country: "",
    currency: "",
    asOf: "",
    norms: [],
    buyerConcerns: [],
    vocabulary: [],
    cautions: [],
  },
  icp: {
    segments: [],
    decisionMakers: [],
    disqualifiers: [],
    buyingSignals: [],
  },
  objections: [],
  voice: {
    tone: [],
    // House style rather than a business claim: these are the words that make
    // any outbound call sound like everyone else's.
    banned: [
      "synergy",
      "revolutionary",
      "game-changing",
      "circle back",
      "touch base",
      "reach out",
      "I hope this email finds you well",
      "cutting-edge",
      "world-class",
      "best-in-class",
    ],
    signaturePhrase: "",
  },
  goals: {
    primary: "",
    secondary: [],
    horizon: "",
    successMetric: "",
  },
  compliance: {
    // Safety defaults, not business claims. These stay switched on.
    aiDisclosure:
      "I should say up front — I am an AI assistant calling on behalf of the business. Happy to bring a human onto the line whenever you want one.",
    optOutLine:
      "If you would rather not hear from us again, say the word and I will remove your number today.",
    recordingNotice:
      "This call may be recorded for quality. If you would prefer that I not record, tell me now and I will stop.",
    quietHours: { start: 9, end: 18 },
    dailyCap: 25,
    cooldownHours: 24,
    suppressedNumbers: [],
    consentPolicy:
      "Business-to-business calls only, during local business hours. Honour opt-outs immediately and permanently. Disclose AI voice on every live call.",
  },
};

/**
 * How this business introduces itself out loud.
 *
 * Kept in one place because "this is Product Pro Hub from Product Pro Hub" is
 * the kind of error that undermines a call in the first two seconds.
 */
export function spokenIntroduction(profile: BusinessProfile): string {
  const name = profile.sender.name.trim();
  const company = profile.company.name.trim() || "our team";
  return name ? `${name} from ${company}` : company;
}

/** Whether the profile can support a specific, defensible call. */
export function composeReadiness(profile: BusinessProfile): ComposeReadiness {
  const missing: string[] = [];
  if (!profile.company.name.trim()) missing.push("Company name");
  if (profile.services.length === 0) missing.push("At least one service");
  if (!profile.company.oneLiner.trim() && !profile.positioning.elevatorPitch.trim()) {
    missing.push("A one-line description of what you do");
  }

  const detail = missing.length
    ? `The composer will not invent your offer. Add: ${missing.join(", ")}.`
    : "Profile is sufficient to compose.";

  return { ok: missing.length === 0, missing, detail };
}

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
  const base = BLANK_PROFILE;
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
  if (Object.keys(stored).length > 0) return mergeProfile(stored);

  // No saved profile. Fall back to a committed seed if one exists, so a fresh
  // checkout — or a reset environment — starts from the operator's own business
  // rather than an empty form. A live profile is never overwritten by the seed.
  const seed = await readJson<ProfilePatch>("seed", {});
  if (Object.keys(seed).length > 0) return mergeProfile(seed);

  return mergeProfile({});
}

export async function saveProfile(incoming: ProfilePatch): Promise<BusinessProfile> {
  const existing = await getProfile();

  // Merge first, then stamp the version — mutation happens on a fresh object,
  // never on the module-level seed.
  const next = mergeProfile({ ...existing, ...incoming });
  next.meta.version = (incoming.meta?.version ?? existing.meta.version) + 1;
  next.meta.updatedAt = nowIso();
  next.meta.placeholder = incoming.meta?.placeholder ?? false;
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

/**
 * Market grounding as prompt text.
 *
 * The console has no live web access, so this is the whole of what the
 * assistant "knows" about how business is done locally. Written down and dated
 * rather than assumed, so it can be reviewed and corrected.
 */
export function marketDigest(profile: BusinessProfile): string {
  const m = profile.market;
  if (!m.country && m.norms.length === 0) return "";

  const vocab = m.vocabulary.filter((v) => v.term || v.meaning);
  return [
    `MARKET: ${m.country}${m.currency ? ` (${m.currency})` : ""}${m.asOf ? ` — reviewed ${m.asOf}` : ""}`,
    m.norms.length ? `HOW BUSINESS IS DONE HERE:\n${m.norms.map((n) => `- ${n}`).join("\n")}` : "",
    m.buyerConcerns.length
      ? `WHAT THESE BUYERS CARE ABOUT:\n${m.buyerConcerns.map((n) => `- ${n}`).join("\n")}`
      : "",
    vocab.length
      ? `LOCAL VOCABULARY:\n${vocab.map((v) => `- "${v.term}": ${v.meaning}`).join("\n")}`
      : "",
    m.cautions.length
      ? `NEVER OVERPROMISE:\n${m.cautions.map((n) => `- ${n}`).join("\n")}`
      : "",
  ]
    .filter((line) => line.trim() !== "")
    .join("\n\n");
}

/** Compact grounding text handed to the language model, when one is configured. */
export function profileDigest(profile: BusinessProfile): string {
  if (profile.services.length === 0 && !profile.positioning.elevatorPitch.trim()) {
    return "PROFILE IS EMPTY — no services, no positioning. Do not fabricate any detail about this business.";
  }
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
    profile.positioning.valueProps.length
      ? `VALUE PROPS:\n${profile.positioning.valueProps.map((v) => `- ${v}`).join("\n")}`
      : "",

    profile.positioning.differentiators.length
      ? `DIFFERENTIATORS:\n${profile.positioning.differentiators.map((v) => `- ${v}`).join("\n")}`
      : "",

    services ? `SERVICES:\n${services}` : "",
    tiers ? `PRICING (${profile.pricing.model || "not set"}):\n${tiers}` : "",
    proof ? `PROOF:\n${proof}` : "",
    objections ? `OBJECTIONS:\n${objections}` : "",
    `ICP: ${profile.icp.segments.map((s) => s.name).join("; ")}`,
    `TONE: ${profile.voice.tone.join("; ")}. Never use: ${profile.voice.banned.join(", ")}.`,
    profile.goals.primary ? `GOAL: ${profile.goals.primary} (${profile.goals.horizon})` : "",
    profile.pricing.disclosure === "budget_led"
      ? "PRICING POSTURE: BUDGET-LED. Never state, guess or imply a price. Always get the buyer's figure first, then describe what that budget buys. Every price band is internal scoping only."
      : profile.pricing.anchor
        ? `PRICING POSTURE: quoted. Anchor: ${profile.pricing.anchor}`
        : "",
    marketDigest(profile),
  ]
    .filter((line) => line.trim() !== "")
    .join("\n\n");
}
