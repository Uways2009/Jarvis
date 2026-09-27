import { equal, sameOrigin, sessionToken } from "@/lib/test-calls/auth";
import { callError, operatorPassword, TestCallError } from "@/lib/test-calls/config";
import { limit } from "@/lib/test-calls/redis";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const expected = operatorPassword();
    await limit("login", 20, 900);
    const body = await req.json().catch(() => null);
    if (typeof body?.password !== "string" || body.password.length > 512 || !equal(body.password, expected)) throw new TestCallError("Incorrect operator password.", 401);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": `nexovira_test=${sessionToken()}; HttpOnly; Secure; SameSite=Strict; Path=/api/test-calls; Max-Age=3600`, "Cache-Control": "no-store" } });
  } catch (error) { return callError(error); }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": "nexovira_test=; HttpOnly; Secure; SameSite=Strict; Path=/api/test-calls; Max-Age=0" } });
  } catch (error) { return callError(error); }
}
