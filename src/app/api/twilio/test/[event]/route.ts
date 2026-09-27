import { testAudio, testWebhook } from "@/lib/test-calls/webhook";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
type Context = { params: Promise<{ event: string }> };
export async function POST(req: Request, ctx: Context) { return testWebhook(req, (await ctx.params).event); }
export async function GET(req: Request, ctx: Context) {
  return (await ctx.params).event === "audio" ? testAudio(req) : new Response("Twilio must POST a signed request to this endpoint.", { status: 405, headers: { Allow: "POST" } });
}
