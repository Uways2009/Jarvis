import type { BusinessProfile, CallMode, CallRecord, Lead, ObjectiveId } from "./types";
import { getEnv, type Env } from "./env";
import { isE164, localHour, normalizePhone } from "./text";
import { readJson } from "./store";

/**
 * Dispatch safety.
 *
 * Outbound voice is a loaded weapon: wrong number, wrong hour, wrong consent,
 * and the damage is done before you can apologise. Every dispatch — dry-run or
 * live — passes through this evaluator, and a single blocker stops the dial.
 */

export const LIVE_CONFIRMATION_PHRASE = "AUTHORIZE CALL";

/**
 * US states requiring all-party consent for call recording. Not legal advice;
 * the console warns rather than decides.
 */
export const ALL_PARTY_CONSENT_STATES = new Set([
  "CA", "CT", "DE", "FL", "IL", "MD", "MA", "MI", "MT", "NV", "NH", "OR", "PA", "WA",
]);

export interface DispatchIntent {
  to: string;
  mode: CallMode;
  confirmPhrase?: string;
  record?: boolean;
  lead?: Lead;
  objective: ObjectiveId;
  /** Region code for recording-consent warnings, e.g. "CA". */
  region?: string;
}

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export interface Verdict {
  armed: boolean;
  /** Mode actually permitted, which may be softer than the one requested. */
  mode: CallMode;
  allowed: boolean;
  /** Everything standing between this dispatch and a dial. */
  blockers: string[];
  /**
   * Rules that stop a live call but not a rehearsal. A dry run is how you test
   * the gate — refusing to rehearse because it is after hours would be absurd.
   */
  wouldBlockLive: string[];
  warnings: string[];
  checks: Check[];
  normalizedTo: string;
}

async function suppressionList(profile: BusinessProfile): Promise<string[]> {
  const stored = await readJson<string[]>("suppression", []);
  return [...profile.compliance.suppressedNumbers, ...stored];
}

export async function evaluateDispatch(
  intent: DispatchIntent,
  profile: BusinessProfile,
  calls: CallRecord[],
  env: Env = getEnv(),
): Promise<Verdict> {
  /** Structural: stops a rehearsal too. */
  const hardBlockers: string[] = [];
  /** Live-only: recorded, surfaced, but not a reason to refuse a rehearsal. */
  const liveBlockers: string[] = [];
  const warnings: string[] = [];
  const checks: Check[] = [];
  const blockers = hardBlockers;

  const normalizedTo = normalizePhone(intent.to ?? "");
  const add = (label: string, ok: boolean, detail: string) => {
    checks.push({ label, ok, detail });
    return ok;
  };

  // 1 — Number hygiene
  if (add("Destination is E.164", isE164(normalizedTo), normalizedTo || "missing")) {
    /* ok */
  } else {
    blockers.push(
      "Destination must be a valid E.164 number (e.g. +14155551212). No dialling on a malformed number.",
    );
  }

  // 2 — Suppression / opt-out
  const suppressed = await suppressionList(profile);
  const isSuppressed =
    normalizedTo !== "" &&
    suppressed.some((n) => normalizePhone(n) === normalizedTo);
  if (add("Not suppressed", !isSuppressed, isSuppressed ? "opt-out on file" : "clear")) {
    /* ok */
  } else {
    blockers.push(
      "This number has opted out or is on the suppression list. That is permanent — do not override it.",
    );
  }

  const liveCalls = calls.filter((c) => c.mode === "live");

  // 3 — Per-number cooldown
  const cooldownMs = env.cooldownHours * 3_600_000;
  const lastToNumber = liveCalls
    .filter((c) => normalizePhone(c.to) === normalizedTo)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const withinCooldown =
    lastToNumber !== undefined &&
    Date.now() - Date.parse(lastToNumber.createdAt) < cooldownMs;
  if (
    add(
      "Outside cooldown window",
      !withinCooldown,
      withinCooldown
        ? `called ${new Date(lastToNumber.createdAt).toISOString()}`
        : `${env.cooldownHours}h clear`,
    )
  ) {
    /* ok */
  } else {
    liveBlockers.push(
      `Already called within the last ${env.cooldownHours}h. Repeat dialling reads as harassment.`,
    );
  }

  // 4 — Daily ceiling
  const since24h = Date.now() - 24 * 3_600_000;
  const recentLive = liveCalls.filter((c) => Date.parse(c.createdAt) > since24h).length;
  const cap = Math.min(env.dailyCap, profile.compliance.dailyCap || env.dailyCap);
  if (
    add(
      "Daily ceiling respected",
      recentLive < cap,
      `${recentLive}/${cap} in the last 24h`,
    )
  ) {
    /* ok */
  } else {
    liveBlockers.push(
      `Daily ceiling reached (${cap} live calls in 24h). Volume without precision burns the list.`,
    );
  }

  // 5 — Quiet hours on the *prospect's* clock
  const tz = intent.lead?.timezone || profile.company.timezone;
  const hour = localHour(tz);
  const { start, end } = profile.compliance.quietHours;
  const inWindow =
    hour === null ? true : start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  if (
    add(
      "Within permitted calling hours",
      inWindow,
      hour === null ? `unknown tz ${tz}` : `${String(hour).padStart(2, "0")}:00 in ${tz}`,
    )
  ) {
    /* ok */
  } else {
    liveBlockers.push(
      `It is ${String(hour).padStart(2, "0")}:00 for the prospect (${tz}); permitted window is ${start}:00–${end}:00. Call at a civilised hour.`,
    );
  }

  // Weekend flag (warning, not a wall — some industries legitimately work weekends)
  if (hour !== null && inWindow) {
    try {
      const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short" }).format(
        new Date(),
      );
      if (weekday === "Sat" || weekday === "Sun") {
        warnings.push(`It is ${weekday} for the prospect. Weekend dialling underperforms for B2B.`);
      }
    } catch {
      /* ignore */
    }
  }

  // 6 — Arming gate
  const armed = env.liveCallsArmed;
  checks.push({
    label: "Live dialling armed",
    ok: armed || intent.mode === "dry_run",
    detail: armed
      ? "NEXOVIRA_LIVE_CALLS=armed"
      : intent.mode === "dry_run"
        ? "Not required for a rehearsal"
        : "NEXOVIRA_LIVE_CALLS is not set to armed",
  });

  let mode: CallMode = intent.mode;
  if (intent.mode === "live" && !armed) {
    mode = "dry_run";
    warnings.push(
      "Live dialling is disarmed. Dispatch was downgraded to a dry run — set NEXOVIRA_LIVE_CALLS=armed to enable real calls.",
    );
  }

  // 7 — Credential readiness
  const twilioReady = Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.fromNumber);
  const twilioMissing = [
    !env.twilio.accountSid && "TWILIO_ACCOUNT_SID",
    !env.twilio.authToken && "TWILIO_AUTH_TOKEN",
    !env.twilio.fromNumber && "TWILIO_FROM_NUMBER",
  ].filter(Boolean) as string[];

  if (
    add(
      "Twilio credentials present",
      twilioReady,
      twilioReady ? `from ${env.twilio.fromNumber}` : `missing ${twilioMissing.join(", ")}`,
    )
  ) {
    /* ok */
  } else {
    liveBlockers.push(`Live dispatch needs Twilio credentials: ${twilioMissing.join(", ")}.`);
  }

  // 7b — Twilio must be able to reach our webhooks over the public internet
  if (mode === "live") {
    if (env.publicBaseUrl) {
      checks.push({ label: "Webhook base URL", ok: true, detail: env.publicBaseUrl });
    } else {
      warnings.push(
        "PUBLIC_BASE_URL is not set, so webhook URLs are derived from the request host. If that host is not reachable from the internet (localhost, a preview host, a private address), Twilio will fetch nothing and the call will die on answer. Set PUBLIC_BASE_URL to a tunnel or deployed origin.",
      );
    }
  }

  // 8 — Explicit authorisation for live dialling
  if (mode === "live") {
    const confirmed = (intent.confirmPhrase ?? "").trim().toUpperCase() === LIVE_CONFIRMATION_PHRASE;
    if (
      add(
        "Operator authorisation phrase",
        confirmed,
        confirmed ? "confirmed" : "phrase missing or incorrect",
      )
    ) {
      /* ok */
    } else {
      liveBlockers.push(
        `Live dispatch requires the operator to type "${LIVE_CONFIRMATION_PHRASE}" to confirm intent.`,
      );
    }
  }

  // 9 — Recording consent
  if (intent.record) {
    const region = (intent.region ?? "").toUpperCase();
    if (ALL_PARTY_CONSENT_STATES.has(region)) {
      warnings.push(
        `Recording for ${region} requires all-party consent. State the recording notice and get verbal agreement before continuing.`,
      );
    } else {
      warnings.push(
        "Recording is enabled. The recording notice will be read on the call; confirm your jurisdiction's consent rules.",
      );
    }
  }

  // 10 — AI disclosure (twilio + most jurisdictions require it; we keep it on)
  if (profile.compliance.aiDisclosure.trim() === "") {
    warnings.push(
      "No AI disclosure line is configured. Live AI-voice calls should always disclose that the caller is an AI.",
    );
  } else {
    checks.push({
      label: "AI disclosure armed",
      ok: true,
      detail: "Disclosure is read before the pitch",
    });
  }

  const wantsLive = intent.mode === "live";
  const allowed = hardBlockers.length === 0 && (!wantsLive || liveBlockers.length === 0);

  return {
    armed,
    mode,
    allowed,
    blockers: wantsLive ? [...hardBlockers, ...liveBlockers] : [...hardBlockers],
    wouldBlockLive: liveBlockers,
    warnings,
    checks,
    normalizedTo,
  };
}

export async function addSuppression(number: string): Promise<string[]> {
  const normalized = normalizePhone(number);
  const list = await readJson<string[]>("suppression", []);
  if (!list.some((n) => normalizePhone(n) === normalized)) list.push(normalized);
  const { writeJson } = await import("./store");
  await writeJson("suppression", list);
  return list;
}
