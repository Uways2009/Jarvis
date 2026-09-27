/** Runtime checks shared by pre-flight and dispatch; TS types do not validate JSON. */
export function validateDispatchBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "A JSON object is required.";
  const value = body as Record<string, unknown>;
  if (typeof value.to !== "string" || !value.to.trim()) return "A destination number is required, including its country code (e.g. +14155551212).";
  for (const key of ["confirmPhrase", "region", "scriptId", "clipId"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") return `${key} must be text.`;
  }
  if (value.mode !== undefined && value.mode !== "live" && value.mode !== "dry_run") return "Choose live or dry_run mode.";
  if (value.record !== undefined && typeof value.record !== "boolean") return "record must be a boolean.";
  if (value.machineDetection !== undefined && !["Enable", "DetectMessageEnd"].includes(value.machineDetection as string)) return "Invalid machine detection option.";
  if (value.objective !== undefined && !["book_meeting", "book_demo", "qualify", "reactivate", "send_info", "event_invite"].includes(value.objective as string)) return "Choose a valid call objective.";
  if (value.lead !== undefined) {
    if (!value.lead || typeof value.lead !== "object" || Array.isArray(value.lead)) return "lead must be an object.";
    for (const key of ["name", "role", "company", "industry", "need", "trigger", "city", "timezone", "phone", "notes"]) {
      const field = (value.lead as Record<string, unknown>)[key];
      if (field !== undefined && typeof field !== "string") return `Lead ${key} must be text.`;
    }
  }
  return null;
}
