import type {
  BusinessProfile,
  ComposedScript,
  Lead,
  ObjectiveId,
  ScriptSection,
} from "./types";
import {
  asSentence,
  estimateSeconds,
  firstSentence,
  overlapScore,
  stemSet,
  truncate,
  words,
} from "./text";
import { spokenIntroduction } from "./profile";
import { newId, nowIso } from "./store";

/**
 * Composition engine.
 *
 * Deterministic by design: deterministic means auditable, repeatable, and
 * runnable with zero API keys. It reads the business profile the way a good
 * sales engineer would — match the service to the stated need, then build a
 * call that earns the next thirty seconds.
 *
 * A language model, when configured, refines this draft; it never invents the
 * facts. The draft is always the floor.
 */

/** Stable pseudo-random pick: same lead produces the same script every time. */
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(variants: T[], seed: number, offset = 0): T {
  return variants[(seed + offset) % variants.length]!;
}

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first.replace(/[^\p{L}'-]/gu, "") || "there";
}

/* ── Discovery ───────────────────────────────────────────────────────────── */

interface DiscoveryTemplate {
  question: string;
  why: string;
}

/**
 * Business-neutral discovery.
 *
 * Deliberately industry-agnostic: an operator's own questions (set per service
 * on the Business Brain) always win, and this set only fills the gap. Hard-coded
 * domain questions would actively mislead any business they were not written
 * for — asking an interior designer about sales headcount is worse than asking
 * nothing.
 */
const NEUTRAL_DISCOVERY: DiscoveryTemplate[] = [
  {
    question: "How are you handling that at the moment?",
    why: "Reveals the current workaround, which is where the real cost usually hides.",
  },
  {
    question: "What have you already tried?",
    why: "Stops you pitching something they have already rejected.",
  },
  {
    question: "Who owns this internally, and who else would need to be involved?",
    why: "Identifies the real buyer and the political terrain.",
  },
  {
    question: "What would need to change for this to become a priority this quarter?",
    why: "Tests urgency without you having to manufacture it.",
  },
  {
    question: "What happens if nothing changes?",
    why: "Surfaces the cost of inaction in their words, not yours.",
  },
];

function discoveryQuestions(
  lead: Lead,
  profile: BusinessProfile,
  service: { discoveryQuestions?: string[] },
): ScriptSection {
  const corpus = stemSet([lead.need, lead.notes ?? "", lead.trigger ?? "", lead.industry].join(" "));

  // The operator's own questions for this service take precedence, in their order.
  const authored = (service.discoveryQuestions ?? []).filter((q) => q.trim() !== "");
  if (authored.length) {
    return {
      kind: "discovery",
      label: "Discovery — your questions for this service",
      lines: authored.slice(0, 5),
      cues: ["These are the questions you set for this service. Ask them, then stop talking."],
    };
  }

  const opener: DiscoveryTemplate = {
    question: lead.need
      ? `You mentioned ${truncate(firstSentence(lead.need), 110)} — how long has that been the case?`
      : "How long has this been a problem?",
    why: "Duration separates a passing niggle from a standing priority.",
  };

  // Rank the neutral set by relevance to what the prospect actually said.
  const ranked = NEUTRAL_DISCOVERY.map((template, index) => ({
    template,
    index,
    score: overlapScore(corpus, template.question),
  })).sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen = [opener, ...ranked.map((r) => r.template)].slice(0, 4);

  return {
    kind: "discovery",
    label: "Discovery — earn the right to pitch",
    lines: chosen.map((t) => t.question),
    cues: chosen.map((t) => t.why),
  };
}

/* ── Objective phrasing ──────────────────────────────────────────────────── */

const CLOSES: Record<ObjectiveId, string[]> = {
  book_meeting: [
    "Worth twenty minutes next week to see whether there is anything in it? I have Tuesday afternoon or Thursday morning.",
    "Shall we put twenty minutes in the diary? You will know inside ten whether this is worth pursuing.",
  ],
  book_demo: [
    "Let me show you the routing and reporting build on screen — twenty-five minutes, and you can judge it against your current setup.",
    "Would a short walkthrough help? I can screen-share the actual build, not a deck.",
  ],
  qualify: [
    "Let me ask two more things so I am not wasting your time — how soon is this something you would act on, and who else would need to be in the room?",
    "Before I take any more of your day: is this a this-quarter problem or a next-year problem?",
  ],
  reactivate: [
    "Worth reopening the conversation now that the picture has changed? I have time Thursday.",
    "Shall I put a short catch-up in the diary and bring the updated numbers?",
  ],
  send_info: [
    "Let me send the one page that maps to what you just described. What is the best address?",
    "I will send one page, no deck. Where should it land?",
  ],
  event_invite: [
    "Worth coming along? I will send the details and hold you a seat.",
    "Should I put your name down for it?",
  ],
};

const OBJECTIVES: Record<ObjectiveId, { label: string; reason: string }> = {
  book_meeting: { label: "Book a discovery meeting", reason: "intent to meet" },
  book_demo: { label: "Book a product walkthrough", reason: "intent to see it" },
  qualify: { label: "Qualify fit and timing", reason: "intent to qualify" },
  reactivate: { label: "Reopen a dormant conversation", reason: "intent to re-engage" },
  send_info: { label: "Secure permission to send material", reason: "intent to follow up" },
  event_invite: { label: "Invite to an event", reason: "intent to attend" },
};

/* ── The engine ──────────────────────────────────────────────────────────── */

export function composeScript(
  profile: BusinessProfile,
  lead: Lead,
  objective: ObjectiveId,
  options: { includeVoicemail?: boolean } = {},
): ComposedScript {
  const seed = seedFrom(`${lead.name}|${lead.company}|${objective}|${lead.need}`);
  const first = firstName(lead.name);
  // "this is X from X" is the fastest way to sound like a robocall.
  const intro = spokenIntroduction(profile);
  const company = profile.company.name || "our team";

  // Match the service to the stated need, with a transparent rationale.
  const query = stemSet(
    [lead.need, lead.notes ?? "", lead.trigger ?? "", lead.industry].join(" "),
  );
  const ranked = profile.services
    .map((service) => {
      const haystack = [service.name, service.summary, ...service.outcomes, ...service.qualifiers].join(
        " ",
      );
      const score = overlapScore(query, haystack);
      return { service, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const matchedService =
    best && best.score > 0
      ? {
          id: best.service.id,
          name: best.service.name,
          score: Number(best.score.toFixed(3)),
          rationale: `Matched on overlap between "${lead.need.slice(0, 80)}" and ${best.service.name}'s outcomes and qualifiers.`,
        }
      : undefined;

  const service =
    (matchedService ? profile.services.find((s) => s.id === matchedService.id) : undefined) ??
    profile.services[0] ??
    // No services configured. Compose against a neutral stand-in so the call
    // still renders and the gap is visible, rather than throwing. The dispatch
    // route refuses this case outright with a precise instruction.
    {
      id: "svc_unspecified",
      name: "Primary offer",
      summary: profile.company.oneLiner || "the work described in your business profile",
      outcomes: [] as string[],
      qualifiers: [] as string[],
    };

  const proof =
    profile.positioning.proofPoints.find((p) => {
      const overlap = overlapScore(query, `${p.label} ${p.detail}`);
      return overlap > 0.15;
    }) ?? profile.positioning.proofPoints[0];

  const segment =
    profile.icp.segments[0]?.name ?? profile.icp.segments.map((s) => s.name).join(", ") ?? "";

  /**
   * The prospect-language statement of the problem, mined from the matched
   * service's qualifiers. Outcomes describe what we deliver; qualifiers
   * describe what they feel — and that is what belongs in a cold call.
   */
  const problemPhrase =
    service.qualifiers
      .map((qualifier) => ({ qualifier, score: overlapScore(query, qualifier) }))
      .sort((a, b) => b.score - a.score)[0]?.qualifier ?? null;

  const sections: ScriptSection[] = [];

  // 1 — Disclosure. Non-negotiable on live AI voice.
  if (profile.compliance.aiDisclosure.trim()) {
    sections.push({
      kind: "disclosure",
      label: "Disclosure — read this first, verbatim",
      lines: [profile.compliance.aiDisclosure.trim()],
      cues: ["Do not paraphrase. Transparency is the licence to operate."],
    });
  }

  // 2 — Opener: identify, disarm, ask permission. Paired variants, so the two
  // lines never echo each other's phrasing.
  const openerPairs = [
    {
      opener: `Hi ${first}, this is ${intro}. I know I am calling out of the blue.`,
      permission:
        "Give me thirty seconds, and if it is not relevant, tell me to get lost and I will not call again.",
    },
    {
      opener: `${first}, morning — ${intro}. This is a cold call, so I will be brief.`,
      permission: "Thirty seconds, and you have my permission to cut me off.",
    },
    {
      opener: `Hi ${first}, ${intro} — unsolicited call, and I will be quick.`,
      permission: "Can I have half a minute before you decide whether this is a waste of your time?",
    },
  ];
  const opener = pick(openerPairs, seed);

  sections.push({
    kind: "opener",
    label: "Opener — 10 seconds",
    lines: [opener.opener, opener.permission],
    cues: [
      "No uptalk, no apology — a confident frame, not a plea.",
      "Silence after the ask. Let them answer; do not fill the gap.",
    ],
  });

  // 3 — Reason for the call. The trigger is quoted rather than spliced into a
  // sentence: a note is a fragment, and quoting it keeps the grammar honest.
  const outcome = (service.outcomes[0] ?? service.summary).replace(/\.$/, "");
  const reasonLines: string[] = [];

  if (lead.trigger) {
    reasonLines.push(`One line in my notes is why I called: "${asSentence(lead.trigger)}"`);
    reasonLines.push(
      problemPhrase
        ? `What that usually points to: ${problemPhrase}. That is the part we work on.`
        : `When I see that, it usually calls for ${outcome.toLowerCase()}. That is the part we build.`,
    );
  } else {
    reasonLines.push(`I work with ${segment} on ${outcome.toLowerCase()}.`);
    reasonLines.push(`Most of the teams I speak to already suspect the problem and cannot prove it.`);
  }

  reasonLines.push(
    lead.need
      ? `And my note on you says: "${asSentence(firstSentence(lead.need))}" Is that still roughly right?`
      : "My guess is that the numbers are fine but the reporting takes too long to trust. Am I close?",
  );

  sections.push({
    kind: "reason",
    label: `Reason — ${OBJECTIVES[objective].label}`,
    lines: reasonLines,
    cues: [
      "Specific beats clever. If the note is wrong, say so and re-qualify on the spot.",
      `Objective in one line when asked "what do you want?": ${OBJECTIVES[objective].label}.`,
    ],
  });

  // 4 — Discovery: your questions for the matched service, else neutral ones.
  sections.push(discoveryQuestions(lead, profile, service));

  // 5 — Value bridge with proof.
  sections.push({
    kind: "value",
    label: "Value bridge — only after they answer",
    lines: [
      pick(
        [
          `Here is why I called. ${profile.company.oneLiner}`,
          `Where we are useful: ${profile.company.oneLiner}`,
        ],
        seed,
        2,
      ),
      service.summary ? `${service.summary}` : "",
      // Proof when it exists. These are whole sentences, so they are dropped in
      // as their own line rather than spliced into a clause — "Most of our work
      // is We scope to your budget" is how a competent operator starts sounding
      // like a machine.
      proof
        ? `Closest comparison — ${proof.label}: ${proof.detail}${proof.metric ? ` Result: ${proof.metric}.` : ""}`
        : asSentence(profile.positioning.valueProps[0] ?? ""),
      // A differentiator, framed as a statement rather than a sentence fragment.
      profile.positioning.differentiators[0]
        ? `Worth knowing about how we work: ${asSentence(profile.positioning.differentiators[0])}`
        : "",
      // The buyer concern, phrased as the question they are already thinking.
      profile.market.buyerConcerns[0] ? `You may be wondering: ${profile.market.buyerConcerns[0]}` : "",
    ].filter(Boolean),
    cues: [
      "Ask for the micro-commitment before this section, not after.",
      "Pause after the result number — let it land.",
    ],
  });

  // 6 — Objection plays: the three most likely, ranked against their context.
  const objectionPool = profile.objections
    .map((play) => ({
      play,
      score: overlapScore(query, `${play.objection} ${play.reframe}`),
    }))
    .sort((a, b) => b.score - a.score || a.play.objection.localeCompare(b.play.objection))
    .slice(0, 3);

  if (objectionPool.length > 0) {
    sections.push({
      kind: "objection",
      label: "Objection plays — anticipate, do not react",
      lines: objectionPool.map((entry) => `"${entry.play.objection}" → ${entry.play.reframe}`),
      cues: [
        "Agree first, then reframe. Never argue with the objection itself.",
        "If they push back twice on the same point, stop selling and book the exit: ask what would have to change.",
      ],
    });
  }

  // 7 — Close. Under budget-led pricing, money is only ever opened by asking
  // for *their* figure — never by offering ours.
  const closeLines: string[] = [pick(CLOSES[objective], seed, 3)];

  if (profile.pricing.disclosure === "budget_led") {
    // One line, not two: the prompt already explains the posture, and saying it
    // twice in the same breath makes the operator sound nervous about money.
    closeLines.push(
      `On cost, since it usually comes up: ${asSentence(
        profile.pricing.budgetPrompt || "we build to whatever you have set aside, so tell me what you were thinking",
      )}`,
    );
  } else if (profile.pricing.anchor) {
    closeLines.push(profile.pricing.anchor);
  }

  closeLines.push(
    profile.voice.signaturePhrase ? profile.voice.signaturePhrase : "Does that land, or am I off track?",
  );

  sections.push({
    kind: "close",
    label: "Close — two options, no open questions",
    lines: closeLines,
    cues: [
      "Offer two times, not 'sometime next week'.",
      profile.pricing.disclosure === "budget_led"
        ? "Money: ask for their figure first. Do not name a price — naming one first anchors the whole negotiation low."
        : "Money: give the anchor from the profile, once, then stop talking.",
      "If they say yes, stop talking. Confirm the email and hang up gracefully.",
    ],
  });

  // 8 — Fallback and exit.
  sections.push({
    kind: "fallback",
    label: "Exit — leave the door open, honour the no",
    lines: [
      profile.compliance.optOutLine,
      "No problem at all — I will send nothing further. Thanks for the thirty seconds.",
    ],
    cues: ["Take the no first time. Persistence here costs the brand more than the deal is worth."],
  });

  // 9 — Voicemail. Prospect-language problem framing beats a rehearsal of their
  // own notes, and the callback number is always the last thing they hear.
  const voicemail = [
    `Hi ${first}, this is ${intro}.`,
    problemPhrase
      ? `The pattern I keep seeing with teams like yours: ${problemPhrase}.`
      : profile.company.oneLiner,
    proof?.metric ? `One comparable team came out at ${proof.metric}.` : "",
    profile.sender.callbackNumber
      ? `I will send one page that maps to it — reach me on ${profile.sender.callbackNumber}. Thanks, ${first}.`
      : `I will send one page that maps to it — reply and I will get it over. Thanks, ${first}.`,
  ]
    .filter(Boolean)
    .join(" ");

  if (options.includeVoicemail !== false) {
    sections.push({
      kind: "voicemail",
      label: "Voicemail — 20 seconds, no rambling",
      lines: [voicemail],
      cues: ["Smile before you speak; it survives the compression."],
    });
  }

  const spoken = sections.filter((s) => s.kind !== "voicemail" && s.kind !== "objection");
  const readAloud = spoken
    .flatMap((section) => section.lines)
    .filter(Boolean)
    .join("\n");

  const smsFollowUp = [
    `${first} — ${intro}, just tried you.`,
    lead.need
      ? `Why I called: ${truncate(firstSentence(lead.need), 100)}`
      : `Why I called: ${truncate(profile.positioning.valueProps[0] ?? profile.company.oneLiner, 100)}`,
    `Worth 20 minutes? Reply YES and I will send two times. Reply STOP and I vanish.`,
  ].join(" ");

  const checklist = [
    "Disclosure read before anything else",
    "Permission asked, and the pause honoured",
    "Two open questions answered by them, not by you",
    "Proof point tied to their words, not yours",
    "Two concrete times offered",
    "Opt-out honoured immediately",
    `Avoid: ${profile.voice.banned.slice(0, 4).join(", ")}`,
  ];

  return {
    id: newId("scr"),
    createdAt: nowIso(),
    profileVersion: profile.meta.version,
    objective,
    lead,
    matchedService,
    sections,
    readAloud,
    voicemail,
    smsFollowUp,
    doNotSay: profile.voice.banned,
    checklist,
    estimatedSeconds: estimateSeconds(readAloud),
    wordCount: words(readAloud),
    generatedBy: "engine",
  };
}
