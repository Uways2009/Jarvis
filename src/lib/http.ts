/** Tiny response helpers shared by every route handler. */

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function twiml(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function badRequest(message: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error: message, ...extra }, 400);
}

export function serverError(error: unknown, extra: Record<string, unknown> = {}): Response {
  const message = error instanceof Error ? error.message : String(error);
  return json({ ok: false, error: message, ...extra }, 500);
}

/** Flatten a form body into a plain string map (Twilio posts urlencoded forms). */
export async function formToRecord(form: FormData): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export async function readForm(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(body)) {
        out[key] = typeof value === "string" ? value : JSON.stringify(value);
      }
      return out;
    } catch {
      return {};
    }
  }
  try {
    return await formToRecord(await req.formData());
  } catch {
    return {};
  }
}

export async function readJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
