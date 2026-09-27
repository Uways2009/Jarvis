import type { BusinessProfile, ComposedScript, Lead, ObjectiveId } from "./types";
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
      /\bhow\b/i,
      /\bwhat\b/i,
      /\bwhy\b/i,
      /\bwhen\b/i,
      /\bwhich\b/i,
      /\bwho\b/i,
      /\bcan you\b/i,
      /\bdo you\b/i,
      /\bhave you\b/i,
      /\?$/,
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

/* ── Spoken construction ─────────────────────────────────────────────────── */

function first(name?: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0]!.replace(/[^\p{L}'-]/gu, "");
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

  if (intent === "objection_price" || intent === "objection_timing" || intent === "objection_incumbent") {
    const reframe = matchedObjection(profile, intent, utterance);
    const anchor = profile.pricing.tiers[0];
    // Quote a price only when price is the subject. Sprinkling figures into
    // every answer reads as a pitch; answering where the objection lives reads
    // as a response.
    const needsAnchor = Boolean(anchor) && intent === "objection_price";

    return {
      intent,
      action: turn >= MAX_TURNS ? "close" : "listen",
      say: [
        reframe ?? `That is a fair position. ${profile.positioning.differentiators[0] ?? profile.company.oneLiner}`,
        needsAnchor ? `For scale: ${anchor!.name} is ${anchor!.price}, ${anchor!.cadence}.` : "",
        intent === "objection_price"
          ? `Does that land, or is the number the real obstacle?`
          : `Does that change the picture, or is the timing genuinely wrong?`,
      ]
        .filter(Boolean)
        .join(" "),
      note: "Agree, reframe with a concrete anchor, then hand the turn back.",
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

/** Testing mode uses the same intent classifier without sales claims or fake bookings. */
export function respondToTest(utterance: string, message: string, turn: number): TurnDecision {
  const intent = classify(utterance);
  if (intent === "not_interested" || intent === "hostile" || /\b(stop|goodbye|bye|end call)\b/i.test(utterance)) {
    return { intent: "not_interested", action: "hangup", say: "Understood. This test is ending, and this number will be blocked from further test calls. Goodbye." };
  }
  if (!utterance.trim() || turn >= 4) return { intent, action: "hangup", say: "Thank you for testing Nexovira. The phone test is now complete. Goodbye." };
  if (intent === "transfer" || intent === "callback") return { intent, action: "hangup", say: "This is only a phone test. I cannot transfer or schedule a callback. Thank you for testing. Goodbye." };
  if (intent === "who_are_you") return { intent, action: "listen", say: "I am Nexovira's automated test assistant, not a human. You can say stop to end this test. Could you hear the message clearly?" };
  return { intent, action: "listen", say: intent === "question" ? `The message supplied for this test is: ${message} Did that answer your question?` : "Thank you, I received your response. The speech interaction is working. Do you have a question about the test message?" };
}
