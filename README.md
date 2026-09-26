# NEXOVIRA

**An executive operations console for outbound voice.** It holds your business in a structured
brain, composes calls that are specific to a prospect's stated problem, renders the voice, and
places the call through Twilio — behind a safety gate that refuses to dial until you say so.

Built as a Next.js app with zero runtime dependencies beyond React and Next. No database, no
queue, no vendor SDKs. Everything it knows is in one JSON profile; everything it does is logged.

---

## What it actually does

**Business brain** — services, pricing, proof points, objection plays, tone rules, ICP, goals and
compliance lines live in a typed profile (`src/lib/types.ts`). Every downstream surface reads it.
Edit it in the UI and the composer, the dialler and the drill all move with it.

**Composition engine** — deterministic and auditable. It matches the prospect's stated need
against your services by term overlap, mines the matching service's *qualifiers* (prospect-language
problems, not deliverables) for the framing, pulls the closest proof point, and builds a sectioned
call: disclosure, opener, reason, discovery, value bridge, ranked objection plays, two-option close,
exit and a twenty-second voicemail. It refuses to compose without a stated need, because a generic
cold call is worse than no call.

**Voice lab** — Fish Audio TTS with model selection, emotion tags, temperature control, and a local
clip library served over a stable path so Twilio can `<Play>` it into a live call.

**Dispatch desk** — the safety gate, live and legible:

| Gate | Behaviour |
| --- | --- |
| Number hygiene | E.164 or nothing |
| Suppression | Permanent opt-out list, never overridden |
| Cooldown | One attempt per number per configurable window |
| Daily ceiling | Rolling 24-hour cap |
| Calling hours | Evaluated in the **prospect's** timezone, not yours |
| Credentials | Twilio SID / token / caller ID must all be present |
| Arming | `NEXOVIRA_LIVE_CALLS=armed` or dispatch is a rehearsal |
| Authorisation | A typed phrase is required for a live dial |
| Disclosure | AI disclosure reads before the pitch, always |
| Recording | All-party-consent jurisdictions raise an explicit warning |

Every check reports its own state, including the ones that pass. A dry run exercises the entire
path — record, transcript, verdict — with no carrier leg, no cost and no prospect disturbed.

**Live call engine** — on answer, Twilio's machine detection forks the call: a human gets a
conversation, an answering machine gets a voicemail drop. The conversation is turn-based speech
recognition feeding a deterministic dialogue engine — intent classification, objection matching
against *your* prepared reframes, warm transfer to a human on request, and immediate permanent
suppression the instant someone says stop.

**Briefings** — a pre-call brief for the account, plus a mock-interview drill built from your own
material with model answers and the reasoning behind each one.

---

## Quick start

```bash
npm install
cp .env.example .env      # fill in what you have; the app runs without any of it
npm run dev               # http://localhost:3000
```

It boots with an **empty business profile** — real structure, real compliance defaults, and no
invented facts. Composition and dispatch stay blocked, with a precise message about what is
missing, until you describe your actual business. The console will never pitch a plausible
fiction on your behalf.

### Going live, in order

1. **Populate the brain** → `/profile`. Services, pricing, proof, objections, tone, compliance.
   The completeness meter names every field still missing. Nothing is guessed for you.
2. **Compose** → `/outreach`. Give a real prospect and a real stated need.
3. **Rehearse** → `/calls`. Run the pre-flight, read the verdict, fix what it flags.
4. **Make yourself reachable.** Twilio fetches your TwiML and audio over the public internet:
   ```bash
   PUBLIC_BASE_URL=https://your-tunnel-or-domain
   ```
   Without this the webhook URLs point at whatever host made the request and calls die on answer.
5. **Add credentials** to `.env` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
   `FISH_AUDIO_API_KEY`) and restart.
6. **Arm** → set `NEXOVIRA_LIVE_CALLS=armed`, restart, then type `AUTHORIZE CALL` at the desk.

---

## Configuration

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | REST credentials and, for the token, webhook signature validation |
| `TWILIO_FROM_NUMBER` | Caller ID; must be a voice-capable number you own. `TWILIO_PHONE_NUMBER` and `TWILIO_CALLER_ID` accepted |
| `TWILIO_TRANSFER_NUMBER` | Warm-transfer target when a prospect asks for a human |
| `FISH_AUDIO_API_KEY` | Voice synthesis |
| `FISH_AUDIO_REFERENCE_ID` | Voice model id; `FISH_AUDIO_VOICE_ID` accepted. Blank uses the platform default |
| `FISH_AUDIO_MODEL` | Default `s2.1-pro-free` — same weights as `s2.1-pro`, free to evaluate |
| `PUBLIC_BASE_URL` | Public origin Twilio fetches TwiML and audio from |
| `NEXOVIRA_LIVE_CALLS` | `armed` enables real dialling. Anything else = rehearsal only |
| `TWILIO_VALIDATE_SIGNATURE` | Keep `true` in production |
| `NEXOVIRA_DAILY_CALL_CAP` / `NEXOVIRA_NUMBER_COOLDOWN_HOURS` | Volume ceilings |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY` | Optional. Enables polish on composed scripts |
| `NEXOVIRA_DATA_DIR` | Where runtime state lives (default `./data`) |

Where two names exist for one thing, the app accepts either — keep your own naming. All
integrations are additive and independent:

**Without Twilio credentials** the console still composes, renders voice, rehearses and logs.
**Without a Fish Audio key** dispatch falls back to Twilio's built-in speech synthesis.
**Without a language-model key** the deterministic engine runs alone — a fully supported mode,
not a degraded one.

Every credential is checked for *shape* on the console's readiness panel (`AC` + 32 hex, a
32-character auth token, a plausible E.164 number, an `sk-…` key). That catches the most common
failure — a key mangled in transit — before you waste a dispatch on it. It does not prove a
credential is active; only a live call does that.

**Timeouts are bounded everywhere.** Twilio REST calls abort after 20s, script polish after 15s,
synthesis after 90s. A configured-but-unreachable provider degrades to the deterministic path in
under a tenth of a second and says so, rather than holding a request open.

---

## Architecture

```
src/
  lib/
    types.ts       the shape of everything
    profile.ts     the business brain, merge semantics, readiness gate
    composer.ts    deterministic call composition
    dialogue.ts    live turn-taking: intent classification, objection matching
    safety.ts      the dispatch gate
    twilio.ts      REST client, TwiML builders, HMAC-SHA1 signature validation
    fishaudio.ts   TTS client
    llm.ts         optional polish (compliance text is fenced off from rewriting)
    repo.ts        call / clip / script repositories
    store.ts       atomic JSON store on disk
    text.ts        tokenising, matching, truncation, timezone maths
  app/
    api/           health, profile, compose, calls, scripts, voice, audio, twilio webhooks
    page.tsx       console   outreach/  calls/  voice/  profile/  briefings/
data/
  profile.example.json   committed reference profile
  profile.json           your real brain (gitignored)
  audio/, calls.json, clips.json, scripts.json, suppression.json   runtime (gitignored)
```

Storage is JSON on disk with atomic writes (tmp + rename) behind a process-wide lock. Swap
`src/lib/store.ts` for a database and nothing else needs to change.

### Design decisions worth knowing

- **The deterministic engine is the floor, never the fallback.** Composition works with no API
  keys at all, and a language model only ever refines it. The disclosure line and the opt-out line
  are excluded from model rewriting entirely: transparency must be verbatim and predictable.
- **Live turn-taking stays in code.** A model round-trip mid-call produces dead air that reads as
  a dropped line, and a hallucinated claim on a recorded call is a liability. Branching is
  deterministic and grounded in the profile; a human takes over on request.
- **Failures are surfaced, not smoothed.** No API key, no credentials, unreachable webhook host,
  refused dispatch — the console states the fact and the fix.
- **Refusals are logged too.** A dispatch that the gate blocks is written to the audit trail with
  its reason. An audit trail that omits refusals is theatre.

---

## Compliance posture

This is a tool for calling businesses, and it is built to be defensible rather than merely
convenient. It discloses that the caller is an AI on every live call. It honours an opt-out the
instant it is spoken, permanently. It dials only inside business hours **in the prospect's
timezone**. It will not redial a number inside the cooldown window, will not exceed the daily
ceiling, and will not place a live call without a typed authorisation.

Recording raises an all-party-consent warning for CA, CT, DE, FL, IL, MD, MA, MI, MT, NV, NH, OR,
PA and WA. That list and the surrounding guidance are engineering safeguards, **not legal advice** —
you remain responsible for consent, telemarketing registration, DNC scrubbing and local law in
every jurisdiction you dial into.

## Verified vs. unverified

Tested end-to-end in this repository: composition and service matching, the full safety gate,
dry-run dispatch and transcripts, webhook TwiML for both human and machine answers, the
objection/opt-out/transfer branches of the live engine, permanent suppression enforced on the
next dispatch, profile merge semantics, audio path-traversal guards, and graceful degradation
with no keys present.

Verified against **real credentials in this repo**: webhook signature validation (a valid HMAC
returns TwiML, a tampered or absent signature returns 403 on both the voice and turn endpoints),
the complete live dispatch path from gate to Twilio request — which passes every check, forms
the request, and fails only at the network boundary — credential shape validation, and
provider-degradation timing.

**Not exercised against the live services.** The development sandbox resets the TLS handshake to
every non-allowlisted host, so `api.twilio.com`, `api.fish.audio`, `api.groq.com` and Google's
endpoints are all unreachable from here. Three things therefore remain unproven until you run
them on an open network: a real Twilio call being placed, real Fish Audio synthesis, and Groq
polish on a composed script. Each is implemented to its provider's documented contract and fails
loudly rather than silently. The first real call is yours — rehearse at the desk first, then dial
one number, at a low volume, and listen to it.

## Rotating a key

Every secret lives in `.env`, which is gitignored. If one is ever exposed — a chat log, a
screenshot, a shared terminal — rotate it at the provider and update `.env`. Keys do not expire
on their own, and `git log` is forever; that is precisely why nothing here is committed.
