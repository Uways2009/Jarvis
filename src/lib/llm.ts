import type { Env } from "./env";
import type { BusinessProfile, ComposedScript, ScriptSection } from "./types";
import { profileDigest } from "./profile";
import { estimateSeconds, words } from "./text";

/**
 * Optional language-model refinement.
 *
 * The deterministic engine is the floor and always runs. When a key is present,
 * a model may rewrite the persuasion surfaces — opener, discovery, value,
 * objections, close — for sharper, more specific wording.
 *
 * Two sections are fenced off and never sent for rewriting:
 *   · the AI disclosure  (transparency must be verbatim and predictable)
 *   · the opt-out line   (a compliance commitment, not a copywriting exercise)
 */

export interface LlmProvider {
  provider: "gemini" | "openai";
  model: string;
  key: string;
}

export function llmProvider(env: Env): LlmProvider | null {
  if (env.llm.geminiKey) {
    return { provider: "gemini", model: env.llm.model || "gemini-2.5-flash", key: env.llm.geminiKey };
  }
  if (env.llm.openaiKey) {
    return { provider: "openai", model: env.llm.model || "gpt-4o-mini", key: env.llm.openaiKey };
  }
  return null;
}

interface Refinement {
  opener?: string;
  reason?: string[];
  discovery?: string[];
  value?: string[];
  objections?: { objection?: string; reframe?: string; trigger?: string }[];
  close?: string[];
  voicemail?: string;
}

const RESPONSE_SCHEMA = `{
  "opener": "string — one or two sentences, spoken, permission-based",
  "reason": ["string — why this specific person, specific to their context"],
  "discovery": ["string — an open question that cannot be answered yes/no"],
  "value": ["string — our relevance to them, with one concrete proof point"],
  "objections": [{"trigger": "the objection in their words", "reframe": "our response"}],
  "close": ["string — a two-option close"],
  "voicemail": "string — under 60 words, one hook, one ask"
}`;

function buildPrompt(profile: BusinessProfile, script: ComposedScript): string {
  return [
    "You are writing a live outbound sales call script for a human or AI voice agent.",
    "Rules: natural spoken English, contractions allowed, no corporate filler, no markdown.",
    "Never invent facts, clients, metrics or prices that are not in the business brief.",
    "Every line must be sayable in one breath. Prefer short sentences.",
    "",
    "BUSINESS BRIEF",
    profileDigest(profile),
    "",
    "PROSPECT",
    `Name: ${script.lead.name} (${script.lead.role})`,
    `Company: ${script.lead.company} — ${script.lead.industry}`,
    `Stated need: ${script.lead.need}`,
    script.lead.trigger ? `Trigger: ${script.lead.trigger}` : "",
    script.lead.notes ? `Notes: ${script.lead.notes}` : "",
    "",
    `OBJECTIVE: ${script.objective}`,
    script.matchedService
      ? `LEAD WITH THIS SERVICE: ${script.matchedService.name} (${script.matchedService.rationale})`
      : "",
    "",
    "CURRENT DRAFT — improve it, keep what works",
    script.readAloud,
    "",
    `Banned words: ${profile.voice.banned.join(", ")}`,
    "",
    "Return only JSON matching this schema:",
    RESPONSE_SCHEMA,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callGemini(provider: LlmProvider, prompt: string): Promise<string | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": provider.key,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
      }),
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return body.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

async function callOpenAi(provider: LlmProvider, prompt: string): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.key}`,
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You write concise, human outbound sales scripts. JSON only." },
        { role: "user", content: prompt },
      ],
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? null;
}

function parseRefinement(raw: string): Refinement | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Refinement;
  } catch {
    return null;
  }
}

/** Rewrite the persuasion surfaces while preserving compliance text verbatim. */
export async function refineScript(
  env: Env,
  profile: BusinessProfile,
  script: ComposedScript,
): Promise<{ script: ComposedScript; model: string } | null> {
  const provider = llmProvider(env);
  if (!provider) return null;

  const prompt = buildPrompt(profile, script);
  let raw: string | null = null;
  try {
    raw = provider.provider === "gemini" ? await callGemini(provider, prompt) : await callOpenAi(provider, prompt);
  } catch {
    return null;
  }
  if (!raw) return null;

  const refinement = parseRefinement(raw);
  if (!refinement) return null;

  const existing = new Map(script.sections.map((section) => [section.kind, section]));
  const keep = (kind: ScriptSection["kind"]): ScriptSection | null => existing.get(kind) ?? null;

  const sections: ScriptSection[] = [];

  const disclosure = keep("disclosure");
  if (disclosure) sections.push(disclosure);

  if (refinement.opener) {
    sections.push({
      kind: "opener",
      label: keep("opener")?.label ?? "Opener",
      lines: [refinement.opener],
      cues: keep("opener")?.cues,
    });
  } else if (keep("opener")) {
    sections.push(keep("opener")!);
  }

  if (refinement.reason?.length) {
    sections.push({
      kind: "reason",
      label: keep("reason")?.label ?? "Reason for the call",
      lines: refinement.reason.filter(Boolean),
      cues: keep("reason")?.cues,
    });
  } else if (keep("reason")) {
    sections.push(keep("reason")!);
  }

  if (refinement.discovery?.length) {
    sections.push({
      kind: "discovery",
      label: keep("discovery")?.label ?? "Discovery",
      lines: refinement.discovery.filter(Boolean),
      cues: keep("discovery")?.cues,
    });
  } else if (keep("discovery")) {
    sections.push(keep("discovery")!);
  }

  if (refinement.value?.length) {
    sections.push({
      kind: "value",
      label: keep("value")?.label ?? "Value bridge",
      lines: refinement.value.filter(Boolean),
      cues: keep("value")?.cues,
    });
  } else if (keep("value")) {
    sections.push(keep("value")!);
  }

  if (refinement.objections?.length) {
    sections.push({
      kind: "objection",
      label: keep("objection")?.label ?? "Objection plays",
      lines: refinement.objections
        .map((o) => {
          const trigger = o.trigger ?? o.objection ?? "";
          return trigger && o.reframe ? `"${trigger}" → ${o.reframe}` : o.reframe ?? "";
        })
        .filter(Boolean),
      cues: keep("objection")?.cues,
    });
  } else if (keep("objection")) {
    sections.push(keep("objection")!);
  }

  if (refinement.close?.length) {
    sections.push({
      kind: "close",
      label: keep("close")?.label ?? "Close",
      lines: refinement.close.filter(Boolean),
      cues: keep("close")?.cues,
    });
  } else if (keep("close")) {
    sections.push(keep("close")!);
  }

  const fallback = keep("fallback");
  if (fallback) sections.push(fallback);

  const voicemail = refinement.voicemail?.trim() || script.voicemail;
  sections.push({
    kind: "voicemail",
    label: keep("voicemail")?.label ?? "Voicemail",
    lines: [voicemail],
    cues: keep("voicemail")?.cues,
  });

  const spoken = sections.filter((s) => s.kind !== "voicemail" && s.kind !== "objection");
  const readAloud = spoken.flatMap((s) => s.lines).filter(Boolean).join("\n");

  return {
    model: provider.model,
    script: {
      ...script,
      sections,
      readAloud,
      voicemail,
      wordCount: words(readAloud),
      estimatedSeconds: estimateSeconds(readAloud),
      generatedBy: "llm",
      llmModel: provider.model,
    },
  };
}
