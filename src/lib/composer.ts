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

/* ── Discovery templates ─────────────────────────────────────────────────── */

interface DiscoveryTemplate {
  /** Tokens that trigger this question. */
  triggers: string[];
  question: string;
  why: string;
}

const DISCOVERY: DiscoveryTemplate[] = [
  {
    triggers: ["follow", "lead", "response", "respond", "speed", "pick"],
    question: "Walk me through what happens today when a lead lands — who picks it up, and how fast?",
    why: "Response-time gaps are the most common source of silent pipeline loss.",
  },
  {
    triggers: ["manual", "spreadsheet", "copy", "hours", "admin", "triage"],
    question: "How much of the week is going into work that should be automated?",
    why: "Quantifies hours before you price anything.",
  },
  {
    triggers: ["visib", "funnel", "attribution", "report", "dashboard", "forecast", "data"],
    question: "If I asked you right now for cost per booked meeting, how long would that take to produce?",
    why: "Exposes whether reporting is instrumented or reconstructed.",
  },
  {
    triggers: ["reply", "outbound", "sequence", "cold", "prospect"],
    question: "What is your reply rate looking like on outbound at the moment?",
    why: "Benchmarks the top of funnel against known outcomes.",
  },
  {
    triggers: ["onboard", "ramp", "training", "new hire", "rep"],
    question: "How long does it take a new rep to run the process without help?",
    why: "Ramp time is a hidden cost of undocumented process.",
  },
  {
    triggers: ["retention", "churn", "renew", "expansion", "customer"],
    question: "Where are customers getting stuck after the sale?",
    why: "Post-sale leakage is frequently the larger number.",
  },
  {
    triggers: ["hire", "headcount", "team", "scale", "grow"],
    question: "Is the plan to hire through this, or to fix the process first?",
    why: "Tests appetite for tooling and process versus pure headcount.",
  },
  {
    triggers: ["crm", "tool", "stack", "hubspot", "salesforce", "consolidat"],
    question: "What is actually in the stack at the moment, and what is earning its keep?",
    why: "Reveals consolidation opportunity and integration surface.",
  },
];

function discoveryQuestions(lead: Lead, profile: BusinessProfile): ScriptSection {
  const corpus = stemSet([lead.need, lead.notes ?? "", lead.trigger ?? "", lead.industry].join(" "));
  const scored = DISCOVERY.map((template) => ({
    template,
    score: template.triggers.reduce(
      (acc, trigger) => acc + (corpus.has(trigger) ? 1 : 0),
      0,
    ),
  }))
    .sort((a, b) => b.score - a.score)
    .filter((entry) => entry.score > 0)
    .slice(0, 3)
    .map((entry) => entry.template);

  const generic: DiscoveryTemplate[] = [
    {
      triggers: [],
      question: "What happens if nothing changes this quarter?",
      why: "Surfaces the cost of inaction without you having to argue for urgency.",
    },
    {
      triggers: [],
      question: "Who owns this internally right now?",
      why: "Identifies the real buyer and the political terrain.",
    },
    {
      triggers: [],
      question: "What have you already tried?",
      why: "Avoids pitching something they have already rejected.",
    },
  ];

  const chosen = [...scored, ...generic].slice(0, 4);
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
  const sender = profile.sender.name || profile.company.name;
  const company = profile.company.name;

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

  const service = matchedService
    ? profile.services.find((s) => s.id === matchedService.id)!
    : profile.services[0]!;

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
      opener: `Hi ${first}, this is ${sender} from ${company}. I know I am calling out of the blue.`,
      permission:
        "Give me thirty seconds, and if it is not relevant, tell me to get lost and I will not call again.",
    },
    {
      opener: `${first}, morning — ${sender} here from ${company}. This is a cold call, so I will be brief.`,
      permission: "Thirty seconds, and you have my permission to cut me off.",
    },
    {
      opener: `Hi ${first}, ${sender} from ${company} — unsolicited call, and I will be quick.`,
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
        ? `When I see that, it usually means ${problemPhrase}. That is the part we fix.`
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

  // 4 — Discovery.
  sections.push(discoveryQuestions(lead, profile));

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
      `${service.summary}`,
      proof
        ? `Closest comparison — ${proof.label}: ${proof.detail}${proof.metric ? ` Result: ${proof.metric}.` : ""}`
        : `Most of our work is ${profile.positioning.differentiators[0] ?? "measured on outcomes"}.`,
      profile.positioning.differentiators[1]
        ? `Two things worth knowing about how we work: ${profile.positioning.differentiators[0]} And ${profile.positioning.differentiators[1]}`
        : (profile.positioning.differentiators[0] ?? ""),
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

  // 7 — Close.
  sections.push({
    kind: "close",
    label: "Close — two options, no open questions",
    lines: [
      pick(CLOSES[objective], seed, 3),
      profile.voice.signaturePhrase
        ? profile.voice.signaturePhrase
        : "Does that land, or am I off track?",
    ],
    cues: [
      "Offer two times, not 'sometime next week'.",
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
    `Hi ${first}, ${sender} from ${company}.`,
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
    `${first} — ${sender} from ${company}, just tried you.`,
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
