import { requireSession, sameOrigin } from "@/lib/test-calls/auth";
import { callError, TestCallError } from "@/lib/test-calls/config";
import { callView, client, loadCall, providerError, terminal } from "@/lib/test-calls/service";
import { key, limit, redis } from "@/lib/test-calls/redis";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  try {
    requireSession(req);
    const { id } = await ctx.params;
    await limit("poll", 120, 60);
    return Response.json({ ok: true, call: await callView(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return callError(error); }
}
export async function POST(req: Request, ctx: Context) {
  try {
    sameOrigin(req); requireSession(req);
    const { id } = await ctx.params;
    await loadCall(id);
    await limit("control", 20, 60);
    const body = await req.json().catch(() => null);
    const [sid, current] = await redis<(string | null)[]>("HMGET", key(`call:${id}`), "sid", "status");
    if (!sid) throw new TestCallError("No carrier call ID yet. Check Twilio Console if the request timed out.", 409);
    if (body?.action !== "sync" && body?.action !== "end") throw new TestCallError("Choose sync or end.");
    try {
      const call = body.action === "end" && !terminal.has(current || "")
        ? await client().calls(sid).update({ status: "completed" })
        : await client().calls(sid).fetch();
      await redis("EVAL", "local old=redis.call('HGET',KEYS[1],'status'); if old==ARGV[1] then redis.call('HSET',KEYS[1],'status',ARGV[2]) end; return 1", 1, key(`call:${id}`), current || "", call.status);
    } catch (error) { throw new TestCallError(providerError(error), 502); }
    return Response.json({ ok: true, call: await callView(id) });
  } catch (error) { return callError(error); }
}
