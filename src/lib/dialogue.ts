import type { BudgetBand, BusinessProfile, ComposedScript, Lead, ObjectiveId } from "./types";
import { overlapScore, stemSet } from "./text";
import { spokenIntroduction } from "./profile";

/**
 * Call dialogue engine.
 *
 * Turn-based, deterministic, sub-second. A live phone call is the worst place
 * for a model round-trip: dead air reads as a dropped line, and a hallucinated
 * claim on a recorded call is a liability. So the branching logic lives here in
 * code, grounded in the business profile, and a human takes over the moment the
 * conversation leaves the map.
 */

export type TurnIntent =
  | "interest"
  | "budget_stated"
  | "budget_refused"
  | "question"
  | "objection_price"
  | "objection_timing"
  | "objection_incumbent"
  | "not_interested"
  | "who_are_you"
  | "callback"
  | "transfer"
  | "hostile"
  | "unclear";

export type TurnAction = "listen" | "close" | "transfer" | "hangup";

export interface TurnDecision {
  intent: TurnIntent;
  say: string;
  action: TurnAction;
  note?: string;
}

export interface TurnContext {
  profile: BusinessProfile;
  lead?: Lead;
  script?: ComposedScript;
  /** 0 = the opening greeting, 1+ = subsequent responses. */
  turn: number;
  objective?: ObjectiveId;
}

export const MAX_TURNS = 7;

/* ── Intent classification ───────────────────────────────────────────────── */

const PATTERNS: { intent: TurnIntent; weight: number; phrases: RegExp[] }[] = [
  {
    intent: "not_interested",
    weight: 100,
    phrases: [
      /\bnot interested\b/i,
      /\bno thank(s| you)\b/i,
      /\b(remove|take) me off\b/i,
      /\bdo not call\b/i,
      /\bdon'?t call\b/i,
      /\bstop calling\b/i,
      /\bunsubscribe\b/i,
      /\bnever call\b/i,
      /\blose my number\b/i,
    ],
  },
  {
    intent: "hostile",
    weight: 98,
    phrases: [/\b(scam|spam|fraud)\b/i, /\bf+u+c+k/i, /\b(shut up|idiot|stupid)\b/i],
  },
  {
    intent: "transfer",
    weight: 90,
    phrases: [
      /\b(real|actual|human) person\b/i,
      /\bspeak (to|with) (a|someone|somebody)\b/i,
      /\btalk to (a|someone|somebody|your)\b/i,
      /\b(your )?(manager|supervisor|boss|founder)\b/i,
      /\bpass me (to|on)\b/i,
      /\btransfer me\b/i,
      /\bhuman being\b/i,
    ],
  },
  {
    intent: "budget_refused",
    weight: 78,
    phrases: [
      /\brather not (?:discuss|say|talk about|get into)\b/i,
      /\bjust (?:tell|give) me (?:your |a |the )?(?:price|figure|number|quote)\b/i,
      /\bwhy (?:do you|d'?you) need to know\b/i,
      /\bdon'?t (?:ask|need) (?:about )?(?:my |the )?budget\b/i,
      /\bwon'?t (?:say|discuss|tell you)\b[^.]{0,20}\bbudget\b/i,
      /\bnot comfortable (?:saying|discussing|sharing)\b/i,
    ],
  },
  {
    intent: "budget_stated",
    weight: 75,
    phrases: [
      /(?:₦|\bnaira\b|\bngn\b)\s?\d/i,
      /\d[\d,.]*\s?(?:k\b|m\b|million|thousand|naira)/i,
      /\bbudget\b[^.]{0,30}\b(?:is|of|around|about|between|up to|like)\b/i,
      /\b(?:we|i)\s(?:have|can (?:do|afford|spend))\b[^.]{0,20}\d/i,
      /\b(?:spend|pay|afford|budget(?:ed)?)\b[^.]{0,24}(?:₦|\d)/i,
      /\b(?:my|our)\s(?:budget|range)\b/i,
    ],
  },
  {
    intent: "callback",
    weight: 80,
    phrases: [
      /\bcall me (back|later|tomorrow|next)\b/i,
      /\b(call|ring) (back|tomorrow|next week|monday|tuesday|wednesday|thursday|friday)\b/i,
      /\bcan we do this (later|another time)\b/i,
      /\bi'?ll call you\b/i,
    ],
  },
  {
    intent: "who_are_you",
    weight: 70,
    phrases: [
      /\bare you (a )?(robot|bot|ai|machine|recording|human)\b/i,
      /\bis this (a )?(recording|robot|ai|automated)\b/i,
      /\bwho is this\b/i,
      /\bwho am i (speaking|talking) (to|with)\b/i,
      /\bwhat company\b/i,
      /\bam i talking to\b/i,
    ],
  },
  {
    intent: "objection_price",
    weight: 60,
    phrases: [
      /\b(too )?(expensive|pricey|costly)\b/i,
      /\b(cost|price|pricing|budget|afford|fee|quote|rate)\b/i,
      /\btoo much money\b/i,
      /\bno budget\b/i,
    ],
  },
  {
    intent: "objection_timing",
    weight: 55,
    phrases: [
      /\bnot (right )?now\b/i,
      /\bnot (a )?(great|good) time\b/i,
      /\btoo busy\b/i,
      /\b(no|little|not much|hardly any) time\b/i,
      /\bdo(n'?t| not) have time\b/i,
      /\b(busy|slammed|swamped|flat out)\b/i,
      /\bnext (quarter|month|year|half)\b/i,
      /\b(q[1-4]|january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
      /\blater\b/i,
    ],
  },
  {
    intent: "objection_incumbent",
    weight: 50,
    phrases: [
      /\balready (have|use|work|got)\b/i,
      /\bwe (have|use|work with)\b/i,
      /\bin.?house\b/i,
      /\binternally\b/i,
      /\b(our|an) agency\b/i,
      /\bwe'?re covered\b/i,
      /\bexisting (vendor|provider|partner)\b/i,
    ],
  },
  {
    intent: "interest",
    weight: 40,
    phrases: [
      /\b(yes|yeah|yep|sure|okay|ok|alright|fine|go ahead)\b/i,
      /\binterested\b/i,
      /\btell me more\b/i,
      /\bsounds (good|interesting|useful)\b/i,
      /\bhow (does|would) (it|that) work\b/i,
      /\b(curious|intrigued)\b/i,
      /\bwhat (do you|would you) (charge|suggest)\b/i,
      /\bsend (me|it|that)\b/i,
      /\bbook\b/i,
      /\blet'?s (talk|do it|chat)\b/i,
    ],
  },
  {
    intent: "question",
    weight: 20,
    phrases: [
      // Interrogatives only count at the start of a clause. Matching bare "who"
      // anywhere turns "I have someone who can do it cheaper" into a question
      // and buries an objection the operator has already prepared an answer for.
      /(?:^|[.!?]\s+)(?:how|what|why|when|which|who|where)\b/i,
      /\b(?:can|could|would|will|do|does|did|have|has|is|are) you\b/i,
      /\?\s*$/,
    ],
  },
];

export function classify(utterance: string): TurnIntent {
  const text = (utterance ?? "").trim();
  if (!text) return "unclear";
  let best: { intent: TurnIntent; weight: number } | null = null;
  for (const group of PATTERNS) {
    if (group.phrases.some((re) => re.test(text))) {
      if (!best || group.weight > best.weight) best = { intent: group.intent, weight: group.weight };
    }
  }
  return best?.intent ?? "unclear";
}


/* ── Budget-led pricing ──────────────────────────────────────────────────── */

/** Pull the largest currency figure out of an utterance, for scoping answers. */
export function extractBudget(utterance: string): { amount: number | null; label: string | null } {
  const text = utterance.toLowerCase().replace(/,/g, "");
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|million|thousand|naira|ngn)?/gi)];

  let best: number | null = null;
  let label: string | null = null;

  for (const match of matches) {
    const value = Number.parseFloat(match[1]!);
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = (match[2] ?? "").toLowerCase();
    let scaled = value;
    if (unit === "k" || unit === "thousand") scaled = value * 1_000;
    else if (unit === "m" || unit === "million") scaled = value * 1_000_000;

    // Ignore obvious non-currency numbers in a budget sentence (page counts etc.)
    if (scaled < 1_000) continue;

    if (best === null || scaled > best) {
      best = scaled;
      label = match[0]!.trim();
    }
  }

  return { amount: best, label };
}

/**
 * Match a stated budget to a scoping band and describe what it buys.
 *
 * Bands are the operator's scoping guide. The *range* is never read aloud —
 * only the scope. Telling a buyer their own number back to them is fine;
 * telling them your floor is not.
 */
function scopeForBudget(
  profile: BusinessProfile,
  amount: number | null,
): { band: BudgetBand; fits: boolean } | null {
  if (amount === null) return null;
  const bands = profile.pricing.budgetBands;
  if (bands.length === 0) return null;

  // Parse the first naira figure in each band's range string for comparison.
  const parsed = bands.map((band) => {
    const nums = [...band.range.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?/gi)]
      .map((m) => {
        const v = Number.parseFloat(m[1]!);
        const u = (m[2] ?? "").toLowerCase();
        return u === "k" || u === "thousand" ? v * 1_000 : u === "m" || u === "million" ? v * 1_000_000 : v;
      })
      .filter((n) => n >= 1_000);
    return { band, low: nums[0] ?? null, high: nums[1] ?? nums[0] ?? null };
  });

  const within = parsed.find((p) => p.low !== null && amount >= p.low && (p.high === null || amount <= p.high));
  if (within) return { band: within.band, fits: true };

  // Below the lowest band, or above the highest.
  const sorted = parsed.filter((p) => p.low !== null).sort((a, b) => a.low! - b.low!);
  if (!sorted.length) return null;
  if (amount < sorted[0]!.low!) return { band: sorted[0]!.band, fits: false };
  return { band: sorted[sorted.length - 1]!.band, fits: true };
}

/* ── Spoken construction ─────────────────────────────────────────────────── */

function first(name?: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0]!.replace(/[^\p{L}'-]/gu, "");
}

/**
 * Best stored objection for an utterance, by wording similarity alone.
 *
 * Used as a catch-all: when the classifier lands on something generic but the
 * operator has already written an answer to what was actually said, their
 * prepared play wins. Their library is authoritative — that is the point of
 * having one.
 */
function nearestStoredObjection(
  profile: BusinessProfile,
  utterance: string,
  minScore = 0.42,
): { objection: string; reframe: string; score: number } | null {
  if (!utterance.trim() || profile.objections.length === 0) return null;
  const tokens = stemSet(utterance);
  const ranked = profile.objections
    .map((play) => ({ ...play, score: overlapScore(tokens, play.objection) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return best && best.score >= minScore ? best : null;
}

/**
 * Match the prospect's objection to the operator's prepared reframe.
 *
 * The category of each stored play is derived by running it through the same
 * classifier that reads the prospect — so the two sides are always speaking the
 * same language. Among plays in the matching category, the closest wording wins.
 * Keyword-sniffing the reframes instead would let a play that merely mentions
 * "budget" hijack a genuine timing objection.
 */
function matchedObjection(
  profile: BusinessProfile,
  intent: TurnIntent,
  utterance: string,
): string | null {
  const tokens = stemSet(utterance);
  const scored = profile.objections.map((play, index) => ({
    play,
    index,
    category: classify(play.objection),
    score: overlapScore(tokens, play.objection),
  }));

  const inCategory = scored
    .filter((entry) => entry.category === intent)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (inCategory.length) return inCategory[0]!.play.reframe;

  // Nothing categorised for this intent: accept a strongly-worded near match,
  // otherwise admit we have no prepared play for it.
  const fallback = scored
    .filter((entry) => entry.score >= 0.34)
    .sort((a, b) => b.score - a.score)[0];

  return fallback?.play.reframe ?? null;
}

/** The opening line. Short, transparent, permission-based. */
export function openingLine(ctx: TurnContext): string {
  const { profile } = ctx;
  const name = first(ctx.lead?.name);
  const intro = spokenIntroduction(profile);
  const disclosure = profile.compliance.aiDisclosure.trim();
  return [
    `Hi ${name}, this is ${intro}.`,
    disclosure,
    `I will keep this to thirty seconds — is that alright?`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Produce the next thing to say and decide what the telephony layer should do.
 */
export function respond(utterance: string, ctx: TurnContext): TurnDecision {
  const { profile, turn } = ctx;
  const intent = classify(utterance);
  const name = first(ctx.lead?.name);
  const human = profile.sender.name.trim();
  // Subject form for sentences about the human who takes over.
  const humanSubject = human || "A colleague of mine";

  // Hard exits first — a "no" is a complete sentence.
  if (intent === "not_interested") {
    return {
      intent,
      action: "hangup",
      say: `Understood, ${name} — I will take you off our list today and you will not hear from us again. Apologies for the interruption.`,
      note: "OPT-OUT: add number to suppression list permanently.",
    };
  }

  if (intent === "hostile") {
    return {
      intent,
      action: "hangup",
      say: `That is fair enough. I will leave you alone — have a good day.`,
      note: "End immediately. Do not defend, do not counter-pitch.",
    };
  }

  if (intent === "transfer") {
    return {
      intent,
      action: "transfer",
      say: `Of course — let me bring a human onto the line now. One moment.`,
      note: "Warm transfer to the human operator.",
    };
  }

  // Transparency questions get a straight answer, every time.
  if (intent === "who_are_you") {
    return {
      intent,
      action: "listen",
      say: [
        `Straight answer: I am an AI assistant calling on behalf of ${profile.company.name}, and a human colleague of mine is available right now if you would rather speak to one.`,
        profile.positioning.elevatorPitch.split(".")[0]
          ? `Context: ${profile.positioning.elevatorPitch.split(".")[0]}.`
          : "",
        `Is that worth two minutes, or would you prefer the human?`,
      ]
        .filter(Boolean)
        .join(" "),
      note: "Disclosure repeated on request. Never deny being an AI.",
    };
  }

  if (intent === "callback") {
    return {
      intent,
      action: "close",
      say: `${humanSubject} will call you personally and confirm a time with you. What is the best number and window to reach you? Thank you, ${name}.`,
      note: "Capture the requested window, then book it. Do not keep selling.",
    };
  }

  // ── Money, handled according to the operator's disclosure policy ─────────
  //
  // Under `budget_led` the assistant will not quote. This is not squeamishness:
  // naming a number first anchors the whole negotiation, and a buyer who was
  // prepared to spend more will simply accept the smaller figure. The move is to
  // get their number, then scope honestly against it.
  if (intent === "budget_stated") {
    const { amount } = extractBudget(utterance);
    const scoped = scopeForBudget(profile, amount);
    const currency = profile.pricing.currency || "₦";

    if (scoped?.fits) {
      return {
        intent,
        action: "close",
        say: [
          `That is workable. At that level you would be looking at ${scoped.band.scope.replace(/\.$/, "")}.`,
          `${humanSubject} can put that in writing with exactly what it covers, so there are no surprises later.`,
          `What is the best email for it?`,
        ].join(" "),
        note: `Budget-led. Matched band "${scoped.band.label}" (${scoped.band.range}, internal only — never quoted). Scope described, price not repeated back.`,
      };
    }

    if (scoped && !scoped.fits) {
      return {
        intent,
        action: "close",
        say: [
          `I will be straight with you — for a site that actually brings you customers, that is below what we would need.`,
          `I would rather tell you that now than take your money and deliver something that does not work.`,
          `What we could do at that level is ${scoped.band.scope.replace(/\.$/, "")}. Would that be worth a conversation, or would you rather I send you a short note for when the budget is bigger?`,
        ].join(" "),
        note: `Budget-led, below floor. Honest decline with a smaller-scope alternative. Never disparage the budget.`,
      };
    }

    // A figure was named but there is no band guide configured.
    return {
      intent,
      action: "close",
      say: [
        `Thanks for being direct — that helps.`,
        `Let me get ${humanSubject === "A colleague of mine" ? "a colleague" : humanSubject} to put a short proposal together that fits ${currency}${amount ? Math.round(amount).toLocaleString("en-NG") : "that"} exactly, so you can see what it covers before committing to anything.`,
        `What is the best email?`,
      ].join(" "),
      note: "Budget-led with no band guide configured. Capture the figure, promise a scoped proposal, do not quote.",
    };
  }

  // They have declined to name a figure. Respect that immediately — pushing
  // twice on budget is how an operator gets a reputation.
  if (intent === "budget_refused") {
    const budgetLed = profile.pricing.disclosure === "budget_led";
    return {
      intent,
      action: "listen",
      say: budgetLed
        ? [
            profile.pricing.noBudgetResponse ||
              "That is fine — I will not press you on it. Let me put a short note together with the options and what each would take.",
            `And I will not ask again.`,
          ].join(" ")
        : [
            profile.pricing.anchor || "Let me give you one figure rather than a range.",
            `Does that land, or is the number the real obstacle?`,
          ].join(" "),
      note: budgetLed
        ? "BUDGET REFUSED. Do not ask again. Pivot to scope and offer a written proposal."
        : "Budget refused under quoted pricing. Give the anchor once.",
    };
  }

  if (intent === "objection_price") {
    const budgetLed = profile.pricing.disclosure === "budget_led";
    return {
      intent,
      action: "listen",
      say: budgetLed
        ? [
            profile.pricing.budgetPrompt ||
              "We do not work from a fixed price list — we build to what you have set aside. What budget were you thinking?",
            `I ask because it changes what I recommend, not because I am sizing you up.`,
          ].join(" ")
        : [
            matchedObjection(profile, intent, utterance) ??
              `That is a fair question, and I would rather give you a real number than a range.`,
            profile.pricing.anchor ? `${profile.pricing.anchor}` : "",
            `Does that land, or is the number the real obstacle?`,
          ]
            .filter(Boolean)
            .join(" "),
      note: budgetLed
        ? "BUDGET-LED: never quote. Get their figure first, then scope against it."
        : "Quoted pricing configured. Anchor given from the profile only.",
    };
  }

  if (intent === "objection_timing" || intent === "objection_incumbent") {
    const reframe = matchedObjection(profile, intent, utterance);
    return {
      intent,
      action: turn >= MAX_TURNS ? "close" : "listen",
      say: [
        reframe ?? `That is a fair position. ${profile.positioning.differentiators[0] ?? profile.company.oneLiner}`,
        intent === "objection_timing"
          ? `Would it help if I sent one page now and we spoke when it is less busy?`
          : `Does that change the picture, or are you genuinely covered?`,
      ].join(" "),
      note: "Agree, reframe, hand the turn back. No price language.",
    };
  }

  // Nothing specific matched. Before falling back to a generic reply, check
  // whether the operator has written an answer to exactly what was just said.
  const stored = nearestStoredObjection(profile, utterance);
  if (stored) {
    return {
      intent,
      action: turn >= MAX_TURNS ? "close" : "listen",
      say: [
        stored.reframe,
        turn >= MAX_TURNS
          ? `Should I put twenty minutes in the diary so we can go through it properly?`
          : `Does that answer it, or is there something else behind that?`,
      ].join(" "),
      note: `Matched your stored objection "${stored.objection}" (similarity ${stored.score.toFixed(2)}). Answer from the library, not from improvisation.`,
    };
  }

  if (intent === "interest") {
    if (turn >= 2) {
      return {
        intent,
        action: "close",
        say: [
          `Good — then let us get twenty minutes in the diary.`,
          `Two options: Tuesday afternoon, or Thursday morning. Which is easier?`,
        ].join(" "),
        note: "Commit to close on stated interest.",
      };
    }
    return {
      intent,
      action: "listen",
      say: [
        `${profile.company.oneLiner}`,
        profile.positioning.proofPoints[0]?.metric
          ? `Closest comparable result: ${profile.positioning.proofPoints[0].metric}.`
          : "",
        `Out of curiosity — what is the biggest friction in the funnel for you right now?`,
      ]
        .filter(Boolean)
        .join(" "),
      note: "Value in one breath, then hand the turn straight back.",
    };
  }

  if (intent === "question") {
    const proof = profile.positioning.proofPoints[turn % Math.max(profile.positioning.proofPoints.length, 1)];
    return {
      intent,
      action: "listen",
      say: [
        proof
          ? `Closest comparable — ${proof.label}: ${proof.detail}${proof.metric ? ` Result: ${proof.metric}.` : ""}`
          : profile.company.oneLiner,
        `Does that answer it, or do you want me to go a level deeper?`,
      ].join(" "),
      note: "Answer in one breath; do not lecture.",
    };
  }

  // Unclear or silence.
  if (turn >= MAX_TURNS) {
    return {
      intent,
      action: "hangup",
      say: `I have taken enough of your time. I will send one page by email and you can judge whether it is worth a conversation. Thank you, ${name}.`,
      note: "Graceful exit. Send the follow-up asset.",
    };
  }

  return {
    intent,
    action: "listen",
    say: `Apologies — the line was unclear. Briefly: we work with teams on ${(profile.services[0]?.outcomes[0] ?? profile.company.oneLiner).toLowerCase()}. Is that a live problem for you this quarter?`,
    note: "Re-anchor simply, then hand the turn back.",
  };
}
