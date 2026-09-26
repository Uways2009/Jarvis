import "server-only";
import { TestCallError } from "./config";

/** Upstash-compatible REST Redis. No process-local or filesystem state. Fail closed. */
export async function redis<T = unknown>(...command: (string | number)[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url?.startsWith("https://") || !token) throw new TestCallError("Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for Vercel-safe call storage and rate limits.", 503);
  try {
    const response = await fetch(url.replace(/\/$/, ""), {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command), cache: "no-store", signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error("Redis HTTP failure");
    const data = await response.json() as { result: T; error?: string };
    if (data.error) throw new Error("Redis command failure");
    return data.result;
  } catch {
    throw new TestCallError("Shared call storage is unavailable. No new call will be placed; check Redis configuration.", 503);
  }
}

export const key = (suffix: string) => `nexovira:phone-test:v1:${suffix}`;
export const TTL = 86400;
export async function limit(name: string, max: number, seconds: number) {
  const count = await redis<number>("EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, key(name), seconds);
  if (count > max) throw new TestCallError("Too many requests. Please wait before trying again.", 429);
}

// Idempotency, global pacing and daily cap are checked in ONE atomic operation.
// Reservations are deliberately not refunded after an ambiguous carrier timeout.
export const RESERVE = `
local previous=redis.call('GET',KEYS[1]); if previous then return previous end
if redis.call('EXISTS',KEYS[2])==1 then return 'cooldown' end
local count=tonumber(redis.call('GET',KEYS[3]) or '0'); if count>=10 then return 'daily-cap' end
redis.call('SET',KEYS[1],ARGV[1],'EX',86400)
redis.call('SET',KEYS[2],1,'EX',60)
redis.call('INCR',KEYS[3]); if count==0 then redis.call('EXPIRE',KEYS[3],86400) end
return 'reserved'`;
