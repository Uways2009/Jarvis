import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getEnv } from "./env";

/**
 * Small JSON store on disk.
 *
 * Deliberately dependency-free: writes are atomic (tmp + rename) and every
 * mutation runs through a single promise chain so concurrent requests cannot
 * interleave into a torn file.
 */

const env = getEnv();

export const DATA_DIR = env.dataDir;
export const AUDIO_DIR = path.join(DATA_DIR, "audio");

const FILES = {
  profile: path.join(DATA_DIR, "profile.json"),
  calls: path.join(DATA_DIR, "calls.json"),
  clips: path.join(DATA_DIR, "clips.json"),
  scripts: path.join(DATA_DIR, "scripts.json"),
  suppression: path.join(DATA_DIR, "suppression.json"),
} as const;

export type StoreFile = keyof typeof FILES;

let chain: Promise<unknown> = Promise.resolve();

/** Serialize all store mutations process-wide. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

async function ensureDirs(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(AUDIO_DIR, { recursive: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown error";
    throw new Error(`Runtime storage is not writable at "${DATA_DIR}" (${code}). Set NEXOVIRA_DATA_DIR to a writable directory and redeploy. On serverless hosts, remove an override pointing into /var/task to use temporary rehearsal storage. Live calls require persistent storage.`);
  }
}

export async function readJson<T>(file: StoreFile, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ FILES[file], "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonUnlocked(file: StoreFile, value: unknown): Promise<void> {
  await ensureDirs();
  const target = FILES[file];
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(/* turbopackIgnore: true */ tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(/* turbopackIgnore: true */ tmp, target);
}

export function writeJson(file: StoreFile, value: unknown): Promise<void> {
  return withLock(() => writeJsonUnlocked(file, value));
}

/** Read-modify-write under the lock. `fn` must be pure and synchronous. */
export function mutateJson<T>(file: StoreFile, fallback: T, fn: (current: T) => T): Promise<T> {
  return withLock(async () => {
    let current = fallback;
    try {
      current = JSON.parse(await fs.readFile(/* turbopackIgnore: true */ FILES[file], "utf8")) as T;
    } catch {
      current = fallback;
    }
    const next = fn(current);
    await writeJsonUnlocked(file, next);
    return next;
  });
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function saveAudioFile(
  id: string,
  bytes: Uint8Array,
  ext: string,
): Promise<string> {
  await ensureDirs();
  const file = `${id}.${ext}`;
  await fs.writeFile(/* turbopackIgnore: true */ path.join(AUDIO_DIR, file), bytes);
  return file;
}

export async function readAudioFile(file: string): Promise<Buffer | null> {
  // Reject any path traversal attempt outright.
  if (file.includes("/") || file.includes("\\") || file.includes("..")) return null;
  try {
    return await fs.readFile(/* turbopackIgnore: true */ path.join(AUDIO_DIR, file));
  } catch {
    return null;
  }
}

export async function deleteAudioFile(file: string): Promise<void> {
  if (file.includes("/") || file.includes("\\") || file.includes("..")) return;
  try {
    await fs.unlink(/* turbopackIgnore: true */ path.join(AUDIO_DIR, file));
  } catch {
    /* already gone */
  }
}
