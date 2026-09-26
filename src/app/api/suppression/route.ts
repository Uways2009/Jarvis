import { addSuppression } from "@/lib/safety";
import { normalizePhone } from "@/lib/text";
import { readJson, writeJson } from "@/lib/store";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The permanent do-not-call list. Honoured before every dispatch, forever. */
export async function GET(): Promise<Response> {
  const list = await readJson<string[]>("suppression", []);
  return json({ ok: true, suppression: list });
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { number?: string } | null;
  if (!body?.number) return json({ ok: false, error: "number is required." }, 400);
  const list = await addSuppression(body.number);
  return json({ ok: true, suppression: list });
}

export async function DELETE(req: Request): Promise<Response> {
  const number = new URL(req.url).searchParams.get("number");
  if (!number) return json({ ok: false, error: "number query parameter required." }, 400);
  const normalized = normalizePhone(number);
  const list = (await readJson<string[]>("suppression", [])).filter(
    (n) => normalizePhone(n) !== normalized,
  );
  await writeJson("suppression", list);
  return json({ ok: true, suppression: list });
}
