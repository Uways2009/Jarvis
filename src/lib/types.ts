/**
 * NEXOVIRA — domain types.
 *
 * Everything the assistant knows about the business lives in `BusinessProfile`.
 * Everything it does lives in `CallRecord` / `VoiceClip` / `ComposedScript`.
 */

export interface ProofPoint {
  id: string;
  label: string;
  detail: string;
  metric?: string;
}

export interface Service {
  id: string;
  name: string;
  summary: string;
  /** Concrete, outcome-shaped language. The composer mines these for hooks. */
  outcomes: string[];
  /** Signals that a prospect is in-market for this service. */
  qualifiers: string[];
  /**
   * Questions worth asking when this service is the subject of a call. Optional:
   * when absent, the composer falls back to a business-neutral discovery set.
   * This is how the console avoids asking an interior designer about headcount.
   */
  discoveryQuestions?: string[];
  priceAnchor?: string;
}

export interface PricingTier {
  id: string;
  name: string;
  price: string;
  cadence: string;
  includes: string[];
  bestFor?: string;
}

/**
 * How this business talks about money.
 *
 * `budget_led` is standard practice across much of the Nigerian SME market, and
 * it is a fundamentally different conversation from quoting: the buyer names a
 * figure and you scope to it. The live call engine respects this — under
 * `budget_led` it never reads a tier price aloud, because publishing a number
 * to a buyer who is about to name a bigger one is how margin disappears.
 */
export type PriceDisclosure = "quoted" | "budget_led";

export interface BudgetBand {
  id: string;
  label: string;
  /** Indicative range. Internal scoping aid — never spoken to a prospect. */
  range: string;
  /** What a buyer at this level realistically gets. This part is sayable. */
  scope: string;
}

export interface Pricing {
  model: string;
  anchor: string;
  tiers: PricingTier[];
  commercialNotes: string;
  disclosure: PriceDisclosure;
  currency: string;
  /** How to ask for the budget without sounding like an interrogation. */
  budgetPrompt: string;
  /** What to say when they will not name a figure. */
  noBudgetResponse: string;
  /** Internal scoping guide, so a stated budget can be answered usefully. */
  budgetBands: BudgetBand[];
  /** Payment structure offered, e.g. milestone splits. */
  paymentTerms: string;
}

/**
 * Market grounding.
 *
 * The console has no live web access, so this is an explicit, dated snapshot of
 * how business is actually done in a market — written down, reviewable, and
 * editable, rather than a silent assumption baked into prompt wording.
 */
export interface MarketGrounding {
  country: string;
  currency: string;
  /** When this snapshot was last reviewed. Stale knowledge should be visible. */
  asOf: string;
  /** Structural facts about how buying happens here. */
  norms: string[];
  /** What buyers in this market care about, argue about, and ask for. */
  buyerConcerns: string[];
  /** Local phrasing worth understanding. */
  vocabulary: { term: string; meaning: string }[];
  /** Reality checks the assistant must not overpromise. */
  cautions: string[];
}

export interface IcpSegment {
  name: string;
  description: string;
  sizeRange?: string;
  /** Situations that make this segment callable *today*. */
  triggers: string[];
}

export interface ObjectionPlay {
  objection: string;
  reframe: string;
}

export interface BusinessProfile {
  meta: {
    version: number;
    updatedAt: string;
    /** True while the profile is still the empty skeleton — nothing real in it. */
    placeholder: boolean;
    label: string;
  };
  company: {
    name: string;
    oneLiner: string;
    category: string;
    website: string;
    hq: string;
    timezone: string;
    founded: string;
    size: string;
  };
  sender: {
    name: string;
    role: string;
    callbackNumber: string;
    email: string;
  };
  positioning: {
    elevatorPitch: string;
    valueProps: string[];
    differentiators: string[];
    proofPoints: ProofPoint[];
  };
  services: Service[];
  pricing: Pricing;
  market: MarketGrounding;
  icp: {
    segments: IcpSegment[];
    decisionMakers: string[];
    disqualifiers: string[];
    buyingSignals: string[];
  };
  objections: ObjectionPlay[];
  voice: {
    tone: string[];
    banned: string[];
    signaturePhrase: string;
  };
  goals: {
    primary: string;
    secondary: string[];
    horizon: string;
    successMetric: string;
  };
  compliance: {
    /** Read verbatim on live calls. Keep it switched on. */
    aiDisclosure: string;
    optOutLine: string;
    recordingNotice: string;
    quietHours: { start: number; end: number };
    dailyCap: number;
    cooldownHours: number;
    suppressedNumbers: string[];
    consentPolicy: string;
  };
}

/**
 * Fields that must exist before the composer can produce a defensible call.
 * An empty profile cannot generate a specific script, and guessing on the
 * operator's behalf is how a brand gets damaged on a recorded line.
 */
export interface ComposeReadiness {
  ok: boolean;
  missing: string[];
  detail: string;
}

/* ── Outreach ───────────────────────────────────────────────────────────── */

export interface Lead {
  name: string;
  role: string;
  company: string;
  industry: string;
  /** The prospect's pain or priority, in your own words. */
  need: string;
  trigger?: string;
  city?: string;
  timezone?: string;
  phone?: string;
  notes?: string;
}

export type ObjectiveId =
  | "book_meeting"
  | "book_demo"
  | "qualify"
  | "reactivate"
  | "send_info"
  | "event_invite";

export type SectionKind =
  | "disclosure"
  | "opener"
  | "reason"
  | "discovery"
  | "value"
  | "objection"
  | "close"
  | "voicemail"
  | "fallback";

export interface ScriptSection {
  kind: SectionKind;
  label: string;
  lines: string[];
  /** Delivery notes — pauses, tone shifts, things to avoid. */
  cues?: string[];
}

export interface ComposedScript {
  id: string;
  createdAt: string;
  profileVersion: number;
  objective: ObjectiveId;
  lead: Lead;
  matchedService?: {
    id: string;
    name: string;
    score: number;
    rationale: string;
  };
  sections: ScriptSection[];
  readAloud: string;
  voicemail: string;
  smsFollowUp: string;
  doNotSay: string[];
  checklist: string[];
  estimatedSeconds: number;
  wordCount: number;
  generatedBy: "engine" | "llm";
  llmModel?: string;
}

/* ── Telephony ──────────────────────────────────────────────────────────── */

export type CallMode = "dry_run" | "live";

export type CallStatus =
  | "dry_run"
  | "queued"
  | "initiated"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "no-answer"
  | "failed"
  | "canceled";

export interface CallEvent {
  at: string;
  status: string;
  detail?: string;
}

export interface CallRecord {
  id: string;
  sid?: string;
  to: string;
  from: string;
  mode: CallMode;
  status: CallStatus;
  telephonyStatus?: string;
  lead?: Lead;
  objective: ObjectiveId;
  scriptId?: string;
  clipId?: string;
  /** What Twilio's answering-machine detection concluded, if anything. */
  answeredBy?: string;
  durationSeconds?: number;
  price?: string;
  priceUnit?: string;
  recordingUrl?: string;
  transcript: { at: string; speaker: "assistant" | "prospect" | "system"; text: string }[];
  events: CallEvent[];
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
}

/* ── Voice ──────────────────────────────────────────────────────────────── */

export interface VoiceClip {
  id: string;
  label: string;
  text: string;
  model: string;
  referenceId?: string;
  format: "mp3" | "wav" | "opus" | "pcm";
  bitrate?: number;
  temperature?: number;
  bytes: number;
  estimatedSeconds: number;
  file: string;
  url: string;
  createdAt: string;
}

/* ── System ─────────────────────────────────────────────────────────────── */

export interface Capabilities {
  twilio: { ok: boolean; missing: string[]; fromNumber?: string };
  fishAudio: { ok: boolean; missing: string[]; model: string };
  llm: { ok: boolean; provider?: "gemini" | "openai" | "groq"; model?: string };
  liveCallsArmed: boolean;
  webhookBaseUrl: string;
  dataDir: string;
}
