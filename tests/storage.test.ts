import assert from "node:assert/strict";
import { test } from "node:test";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { resolveDataDir, isServerlessRuntime } from "../src/lib/storage-config";

test("storage defaults to a writable temporary location on serverless only", () => {
  assert.equal(resolveDataDir({}, "/app"), "/app/data");
  for (const env of [{ VERCEL: "1" }, { AWS_LAMBDA_FUNCTION_NAME: "calls" }, { LAMBDA_TASK_ROOT: "/var/task" }]) {
    assert.equal(resolveDataDir(env, "/app"), path.join(os.tmpdir(), "nexovira-data"));
  }
  assert.equal(resolveDataDir({}, "/var/task"), path.join(os.tmpdir(), "nexovira-data"));
  assert.equal(resolveDataDir({ NEXOVIRA_DATA_DIR: "/mnt/persistent" }, "/app"), "/mnt/persistent");
  assert.equal(isServerlessRuntime({}, "/var/task-copy"), false);
});

test("serverless storage supports rehearsals and audio but does not clear live calls", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "jarvis-storage-"));
  process.env.VERCEL = "1";
  process.env.NEXOVIRA_DATA_DIR = dir;
  try {
    const store = await import("../src/lib/store");
    await store.writeJson("suppression", ["+14155551212"]);
    assert.deepEqual(await store.readJson("suppression", []), ["+14155551212"]);
    const file = await store.saveAudioFile("sample", new Uint8Array([1, 2, 3]), "mp3");
    assert.deepEqual(await store.readAudioFile(file), Buffer.from([1, 2, 3]));
    const { POST } = await import("../src/app/api/calls/preflight/route");
    const check = async (mode: string) => {
      const response = await POST(new Request("http://localhost/api/calls/preflight", {
        method: "POST", body: JSON.stringify({ to: "+14155551213", mode }),
      }));
      assert.equal(response.status, 200);
      return (await response.json()).verdict;
    };
    assert.equal((await check("dry_run")).allowed, true);
    const live = await check("live");
    assert.equal(live.allowed, false);
    assert.ok(live.blockers.some((message: string) => message.includes("persistent storage")));
  } finally {
    delete process.env.VERCEL;
    delete process.env.NEXOVIRA_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
});
