import { getScript, listScripts } from "@/lib/repo";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const script = await getScript(id);
    if (!script) return json({ ok: false, error: "Script not found." }, 404);
    return json({ ok: true, script });
  }

  const scripts = await listScripts();
  return json({
    ok: true,
    scripts: scripts.slice(0, 40).map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      objective: s.objective,
      lead: s.lead,
      matchedService: s.matchedService?.name,
      estimatedSeconds: s.estimatedSeconds,
      generatedBy: s.generatedBy,
      voicemail: s.voicemail,
      readAloud: s.readAloud,
    })),
  });
}
