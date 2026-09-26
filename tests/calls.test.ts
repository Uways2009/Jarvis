import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizePhone, isE164 } from "../src/lib/text";
import { validateDispatchBody } from "../src/lib/dispatch-input";

test("phone normalization preserves destinations and rejects ambiguous input", () => {
  for (const input of ["+44 (20) 7946-0958", "0044 20 7946 0958"]) {
    assert.equal(normalizePhone(input), "+442079460958");
  }
  for (const input of ["", "02079460958", "4155551212", "+14155551212 ext 9", "++14155551212", "+1call4155551212"]) {
    assert.equal(isE164(normalizePhone(input)), false, input);
  }
});

test("malformed dispatch JSON returns validation errors", () => {
  for (const body of [null, [], { to: 123 }, { to: "+14155551212", record: "false" }, { to: "+14155551212", lead: { timezone: 42 } }]) {
    assert.ok(validateDispatchBody(body));
  }
  assert.equal(validateDispatchBody({ to: "+14155551212", lead: { timezone: "Europe/London" } }), null);
});

test("blocked attempts do not lock out a corrected call; real calls still do", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "jarvis-calls-"));
  process.env.NEXOVIRA_DATA_DIR = dir;
  try {
    const { evaluateDispatch } = await import("../src/lib/safety");
    const { BLANK_PROFILE } = await import("../src/lib/profile");
    const { getEnv } = await import("../src/lib/env");
    const profile = structuredClone(BLANK_PROFILE);
    profile.company.timezone = "UTC";
    profile.compliance.quietHours = { start: 0, end: 24 };
    const env = getEnv();
    env.liveCallsArmed = true;
    env.twilio = { ...env.twilio, accountSid: "AC" + "a".repeat(32), authToken: "b".repeat(32), fromNumber: "+14155551213" };
    const intent = { to: "+14155551212", mode: "live" as const, objective: "book_meeting" as const, confirmPhrase: "AUTHORIZE CALL" };
    const { newCallRecord } = await import("../src/lib/repo");
    const blocked = await newCallRecord({ to: intent.to, from: env.twilio.fromNumber, mode: "live", status: "failed", objective: intent.objective, blockedReason: "Missing authorization" });
    assert.equal((await evaluateDispatch(intent, profile, [blocked], env)).allowed, true);
    assert.equal((await evaluateDispatch(intent, profile, [{ ...blocked, sid: "CA123" }], env)).allowed, false);
    assert.equal((await evaluateDispatch(intent, profile, [{ ...blocked, status: "queued" }], env)).allowed, false);
    profile.compliance.suppressedNumbers = [intent.to];
    assert.equal((await evaluateDispatch(intent, profile, [], env)).allowed, false);
    profile.compliance.suppressedNumbers = [];
    const invalidZone = await evaluateDispatch({ ...intent, lead: { name: "", role: "", company: "", industry: "", need: "", timezone: "invalid-zone" } }, profile, [], env);
    assert.equal(invalidZone.allowed, false);
    const { POST } = await import("../src/app/api/calls/preflight/route");
    const response = await POST(new Request("http://localhost/api/calls/preflight", { method: "POST", body: JSON.stringify({ to: 42 }) }));
    assert.equal(response.status, 400);
    profile.company.name = "";
    const { writeJson } = await import("../src/lib/store");
    await writeJson("profile", profile);
    const preflight = await POST(new Request("http://localhost/api/calls/preflight", { method: "POST", body: JSON.stringify({ to: intent.to, mode: "dry_run" }) }));
    assert.equal((await preflight.json()).verdict.allowed, false, "incomplete profile cannot be cleared by preflight");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
