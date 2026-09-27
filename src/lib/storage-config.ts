import os from "node:os";
import path from "node:path";

export function isServerlessRuntime(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): boolean {
  return env.VERCEL === "1" || Boolean(env.AWS_LAMBDA_FUNCTION_NAME || env.LAMBDA_TASK_ROOT) ||
    cwd === "/var/task" || cwd.startsWith("/var/task/");
}

export function resolveDataDir(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): string {
  const configured = env.NEXOVIRA_DATA_DIR?.trim();
  if (configured) return path.resolve(cwd, configured);
  return isServerlessRuntime(env, cwd)
    ? path.join(os.tmpdir(), "nexovira-data")
    : path.join(cwd, "data");
}

export const SERVERLESS_STORAGE_WARNING =
  "This serverless deployment uses local files, which are temporary and not shared between instances. " +
  "Rehearsals are available, but live calls require persistent storage for call records, scripts and opt-outs. " +
  "Run this app on a server with a persistent disk and set NEXOVIRA_DATA_DIR to that writable directory. " +
  "A serverless deployment needs a shared database/object-storage adapter; setting the directory to /tmp is not sufficient for live calls.";
