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
    placeholder: false,
    label: "Product Pro Hub",
  },
  company: {
    name: "Product Pro Hub",
    oneLiner: "We build websites for businesses. Website development starts from ₦100,000.",
    category: "Website development",
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
    elevatorPitch: "Product Pro Hub offers website development for businesses, with projects starting from ₦100,000.",
    valueProps: ["Website development for businesses", "Projects start from ₦100,000"],
    differentiators: [],
    proofPoints: [],
  },
  services: [
    {
      id: "website-development",
      name: "Website development",
      summary: "Website development for businesses.",
      outcomes: ["A website for the business"],
      qualifiers: ["Needs a website", "Wants to improve an existing website"],
      priceAnchor: "Starts from ₦100,000",
    },
  ],
  pricing: {
    model: "Project-based",
    anchor: "Website development starts from ₦100,000",
    tiers: [],
    commercialNotes: "",
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
  return mergeProfile(stored);
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
    `GOAL: ${profile.goals.primary} (${profile.goals.horizon})`,
  ]
    .filter((line) => line.trim() !== "")
    .join("\n\n");
}
