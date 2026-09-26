# Nexovira phone test — Vercel setup and verification

## Scope and architecture

The existing Next.js App Router application, UI, dispatch desk, business profile,
Voice Lab and original Twilio endpoints are preserved. Open **Dispatch → Phone
test** (`/calls/test`). This is an additional controlled test flow, not a migration
of the existing filesystem-backed business tools.

```
Phone test UI → same-origin Next.js API → official Twilio Node SDK → your phone
                                 ↕
                     shared Upstash REST Redis
                                 ↕
Twilio → signed voice/turn/status webhooks → existing Nexovira intent engine
                                        → Twilio Say or existing Fish Audio TTS
```

The test reads the supplied message verbatim after an AI disclosure. It reuses
`classify()` through `respondToTest()` in the existing dialogue module for
bounded replies. It does **not** run arbitrary instructions as a general-purpose
LLM agent. Groq remains available to the existing script composer, but is not
required for a phone test. No recordings, scheduling, sales claims or transfers
are created by this flow.

Rehearsal is a text-based conversation simulation: **no Twilio, Fish Audio,
Redis, or other external service is contacted** by the rehearsal endpoint. The
surrounding existing app shell can still load its normal health information.

## 1. Vercel environment variables

Add these under **Project → Settings → Environment Variables** for the environment
you will use, then redeploy. Do not use `NEXT_PUBLIC_` prefixes.

| Variable | Value / requirement |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Your real Twilio account SID (`AC…`), not a test-credential account SID |
| `TWILIO_AUTH_TOKEN` | The real account auth token from Twilio Console |
| `TWILIO_PHONE_NUMBER` | Your Twilio voice-capable number, e.g. `+14155551213` |
| `NEXOVIRA_LIVE_CALLS` | Exactly `armed` to permit live calls. Any other value or missing = live calls refused; rehearsal still works |
| `APP_URL` | Public HTTPS origin, e.g. `https://your-project.vercel.app`, no path/query |
| `NEXOVIRA_TEST_PASSWORD` | A unique random operator password of at least 16 characters. Used to unlock live testing; do not reuse a provider API key |
| `NEXOVIRA_TEST_NUMBERS` | Comma-separated international numbers you own or have permission to call, e.g. `+2348012345678,+14155551212` |
| `UPSTASH_REDIS_REST_URL` | HTTPS REST URL for an Upstash Redis database |
| `UPSTASH_REDIS_REST_TOKEN` | Its read/write REST token (not a read-only token) |

Create an Upstash Redis database through the Vercel Marketplace or Upstash,
preferably near the Vercel function region. Copy its REST URL/token into those
exact names. The database must support Redis hashes, lists, expiry and `EVAL`.
The flow fails closed if shared storage or rate limiting cannot be reached.
Do not substitute a local Redis process or `/tmp`.

Optional existing voice settings:

| Variable | Use |
| --- | --- |
| `FISH_AUDIO_API_KEY` | Required only when choosing Fish Audio |
| `FISH_AUDIO_VOICE_ID` | Your Fish reference voice/model ID |
| `FISH_AUDIO_MODEL` | Optional existing model override; use a model supported by your Fish account |
| `GROQ_API_KEY` | Existing composer integration only; not used by the bounded phone-test dialogue |

Existing aliases remain supported: `TWILIO_FROM_NUMBER` takes precedence over
`TWILIO_PHONE_NUMBER`; `FISH_AUDIO_REFERENCE_ID` takes precedence over
`FISH_AUDIO_VOICE_ID`. Remove stale conflicting aliases if the wrong number or
voice is selected.

Test webhook origin precedence:

1. `APP_URL`
2. `PUBLIC_BASE_URL` (existing configuration)
3. `https://${VERCEL_PROJECT_PRODUCTION_URL}`
4. `https://${VERCEL_URL}`

Set `APP_URL` explicitly for deterministic behavior, especially when testing a
preview deployment: Vercel's production URL may otherwise point at a different
build. Host headers from arbitrary browser requests are not used to choose the
webhook domain. The selected domain must serve this same deployment and Redis
configuration. Do not change domains mid-call.

## 2. Twilio Console settings and permissions

1. **Account dashboard:** use the **live** account SID/auth token. Twilio test
   credentials simulate API operations and cannot ring a real phone.
2. **Phone Numbers → Manage → Active numbers:** choose/purchase a number with
   **Voice** capability. Put that number in `TWILIO_PHONE_NUMBER`.
3. **Trial accounts:** verify the receiving phone number under **Phone Numbers →
   Manage → Verified Caller IDs** (Console labeling may vary). A trial account
   plays Twilio's trial announcement and can only call eligible verified numbers.
4. **Voice → Settings → Geo permissions:** enable outbound calling to the test
   destination's country. Nigeria (+234), for example, must be permitted by your
   account and Twilio's current geographic/risk restrictions.
5. Ensure your account is active, has funds/trial balance and satisfies any
   country-specific caller-ID, number-registration or account-verification rules.
   Some destinations require an upgraded account or additional approval.
6. **No TwiML App, API key in the browser, SIP setup or manual outbound webhook
   registration is needed.** The server supplies the voice URL, POST method and
   status callback events on each `calls.create()` request.
7. Do **not** replace the phone number's existing **“A call comes in”** setting.
   This feature is outbound-only; changing the inbound setting is unnecessary.
8. Use **Monitor → Logs → Calls / Errors** to inspect the real carrier result and
   provider error details. The UI intentionally does not serialize raw SDK errors
   or account credentials.

## 3. Exact webhook URLs

The app generates these automatically for each Redis-backed test call:

| Purpose | Method / URL |
| --- | --- |
| Answer / first greeting | `POST https://YOUR_DOMAIN/api/twilio/test/voice?id=CALL_UUID` |
| Speech/DTMF reply | `POST https://YOUR_DOMAIN/api/twilio/test/turn?id=CALL_UUID&turn=1` (then 2–4) |
| Carrier status | `POST https://YOUR_DOMAIN/api/twilio/test/status?id=CALL_UUID` |
| Fish audio, when synthesized | `GET https://YOUR_DOMAIN/api/twilio/test/audio?token=OPAQUE_RANDOM_TOKEN` |

Voice/turn/status require a valid `X-Twilio-Signature` checked by the official SDK,
plus the matching account, destination and bound call SID. Signature checking is
**always on** here, regardless of the older flow's `TWILIO_VALIDATE_SIGNATURE`
setting. An unsigned curl/browser request is intentionally rejected; GET on a
voice webhook returns 405. Use a real signed Twilio POST to test reachability.

Audio uses a random 192-bit bearer URL, expires after 10 minutes and contains no
provider secrets or spoken text in its URL. Anyone holding that URL can fetch it
until expiry; do not share it.

**Vercel deployment protection must not intercept these webhook/audio paths.**
Use a publicly reachable production domain, or configure a protection exception
supported by your Vercel plan. A Vercel login page, redirect, IP firewall or bot
challenge will prevent Twilio from reaching the app. Do not put protection-bypass
secrets or Twilio credentials in the client or webhook query strings. If desired,
protect other application pages separately while keeping these paths accessible.

Browser control endpoints (operator cookie required for live actions):

- `POST /api/test-calls/session`: operator login; issues a Secure, HttpOnly,
  SameSite=Strict cookie, valid one hour.
- `DELETE /api/test-calls/session`: logout.
- `POST /api/test-calls`: rehearsal or explicitly authorized live initiation.
- `GET /api/test-calls/CALL_UUID`: status/transcript; never account credentials.
- `POST /api/test-calls/CALL_UUID`: `{ "action": "sync" }` fetches Twilio's current
  status; `{ "action": "end" }` ends the carrier call.

## 4. Test a rehearsal

1. Open **Dispatch → Phone test**.
2. Keep **Rehearsal** selected.
3. Enter an international number and edit the test message (up to 600 characters).
4. Click **Start rehearsal**. No operator password or integrations are required.
5. Enter simulated replies such as `yes`, `who are you?`, or a question. Blank
   input simulates silence. `stop` ends the simulation.
6. Read the transcript/status. Rehearsal does not dial, synthesize paid speech,
   store an opt-out, or contact Twilio. Choose **New test** to reset it.

## 5. Test a REAL call

1. Configure the variables and Twilio permissions above; redeploy.
2. Use your own allowlisted/verified phone with permission to receive the call.
3. Open `/calls/test`, select **Live**, enter the number and message, and initially
   choose **Twilio speech** to eliminate optional TTS latency.
4. Enter the operator password and click **Unlock live testing**. Never enter a
   Twilio, Fish or Redis credential into this form.
5. Click **Review live call**, read the destination/charge warning, check the
   permission box, and type **exactly** `AUTHORIZE CALL` (case and spaces matter).
6. Click **Place REAL call** once. Watch Preparing call → Calling → Ringing →
   In progress. Answer the phone, listen for the AI disclosure and your message,
   and speak. The existing intent engine responds through TwiML.
7. The call ends on silence, after four responses, or after the carrier's 120-second
   limit. **End call** in the UI also ends it. `stop`/opt-out speech or any keypad
   digit ends it **and permanently blocks that number from further test calls**.
8. Use **Sync with Twilio** if callbacks appear delayed. Confirm the outcome in
   Twilio Console as well. Finished outcomes include Completed, Failed, Busy,
   No answer and Ended.
9. Once the basic path succeeds, try Fish Audio. Slow/unavailable synthesis or a
   missing Fish key falls back to Twilio speech. No Fish secrets leave the server.
10. Set `NEXOVIRA_LIVE_CALLS=disarmed` and redeploy when finished. An already-running
    call will hang up on its next voice turn; use End call/Twilio Console for
    immediate termination. Remove access to the test screen if no longer needed.

If an initiation request times out, the call **may already exist**. Recover/retry
using the same on-screen request rather than starting a new one. The atomic
request ID prevents another carrier request for 24 hours. Do not reload and
repeatedly click: check Twilio Console first. If the carrier responded with a
known rejection, the UI explains common verification, permission and credential
errors without exposing its raw response.

## 6. Safety, retention and Vercel limitations

- Only an authenticated operator can initiate, inspect, sync or end live tests.
  Origin checks prevent cross-origin browser submissions. Login is globally
  limited to 20 attempts per 15 minutes. This is a basic test-only shared-password
  gate, not a production identity/authorization system.
- Numbers must be explicitly allowlisted; caller-ID self-calls are refused.
  Authorization and consent are rechecked server-side. Live calling defaults off.
- Global Redis Lua reservations enforce **one attempt per 60 seconds** and
  **10 attempts per rolling 24-hour window**, including failed/unconfirmed
  attempts. No automatic SDK retries. Duplicate request IDs recover the original
  record. These fixed test limits are separate from the original dispatch caps.
- A reservation is intentionally retained if a function crashes before or after
  contacting Twilio. This favors avoiding duplicate charged calls over retrying
  automatically. A rare crash before carrier submission may leave a Preparing
  record with no real call: inspect Twilio Console before starting another test.
- Call records, request reservations and transcripts expire after 24 hours.
  Audio/TwiML caches expire after 10 minutes. Test opt-outs have **no expiry**.
  Use a non-evicting Redis configuration and do not clear the test key namespace:
  deleting it resets rate limits, idempotency and opt-outs. Restrict database access.
- Opt-outs for this controlled test flow are stored separately from the older
  filesystem-backed business suppression list. Do not use this feature for
  unsolicited outreach or as a workaround for an existing opt-out.
- Nothing in this flow requires a local file, localhost webhook, persistent Node
  process or in-memory rate limit. It works across Vercel cold starts/instances
  through shared Redis. Existing business features retain their previous storage
  architecture and its limitations; they have not silently been migrated.
- Twilio webhooks must respond quickly. Fish has a four-second synthesis budget
  and a 700 KB audio cap, then falls back to Twilio speech. Redis should be near
  the function region. No real-time streaming/WebSocket agent is used; speech
  interaction is turn-based `<Gather>`.
- API and webhook functions declare the Node runtime and a 30-second maximum.
  Individual operations use shorter provider timeouts. Extreme latency or a
  platform timeout can still interrupt a call; check Twilio/Vercel logs. Status
  callbacks are sequence-checked against late/duplicate updates; Sync with
  Twilio can recover a missed callback.
- Vercel preview deployments and production should use separate Redis databases
  and test allowlists if you need isolation. `APP_URL` must point to the deployment
  whose code and secrets match the active test.
- This does not secure every pre-existing Nexovira API or make the application
  production-ready. The older business dispatch remains blocked on serverless
  local storage; use the new Phone test screen for this integration test.

## 7. Verification performed, and what remains unverified

Run:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

The integration test disables external network access and drives the **actual
Twilio SDK HTTP transport** against mocked Twilio responses. It checks the
outbound number, caller ID, URL, event subscriptions, exact authorization, login,
allowlist, disarmed behavior, duplicate requests, cooldown/cap, signed speech/status
webhooks, non-regressing statuses, opt-out, hangup, sanitized provider errors,
Fish playback and speech fallback. A production-server HTTP smoke test also
verified the existing/new screens, rehearsal routing, proxy-aware origin checks,
unauthenticated live rejection and webhook method handling. Redis REST/Lua effects are modeled in the test
suite; this is not a claim of verification against your hosted Redis database.

**No real Twilio credentials, configured Redis service or authorized receiving
phone were available in the workspace. No real carrier call was placed.** The
real SDK initiation and webhook integration is implemented and mock-tested; you
must deploy/configure the services and complete section 5 to verify actual phone
connectivity, geographic permissions, signature URLs and carrier audio.

## 8. Files in this feature

Created:

- `src/app/calls/test/page.tsx`
- `src/app/api/test-calls/route.ts`
- `src/app/api/test-calls/session/route.ts`
- `src/app/api/test-calls/[id]/route.ts`
- `src/app/api/twilio/test/[event]/route.ts`
- `src/lib/test-calls/auth.ts`
- `src/lib/test-calls/config.ts`
- `src/lib/test-calls/redis.ts`
- `src/lib/test-calls/service.ts`
- `src/lib/test-calls/webhook.ts`
- `tests/phone-test.test.ts`
- `docs/PHONE_TEST.md`

Existing files modified for this feature:

- `src/app/calls/page.tsx` — link to Phone test; existing dispatch retained.
- `src/lib/dialogue.ts` — testing response mode using the existing classifier.
- `src/lib/fishaudio.ts` — optional shorter timeout for interactive synthesis;
  existing studio default unchanged.
- `package.json`, `package-lock.json` — official Twilio SDK, server-only import
  guard, network mocking test dependency and server test import conditions.
- `.env.example` — documented test configuration.
- `README.md` — setup link and clarification of serverless test storage.

Changes already present from earlier storage/calling fixes are not new changes
made by this feature. No custom `vercel.json` or replacement application was added.
