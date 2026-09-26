import { readAudioFile } from "@/lib/store";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  opus: "audio/ogg",
  pcm: "audio/L16",
};

/**
 * Serves generated clips. Public by necessity — Twilio fetches this URL to
 * `<Play>` audio into a live call. Filenames are random, and nothing else in
 * the data directory is reachable from here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const buffer = await readAudioFile(file);
  if (!buffer) return json({ ok: false, error: "Audio not found." }, 404);

  const ext = file.split(".").pop()?.toLowerCase() ?? "mp3";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "public, max-age=3600, immutable",
      "Accept-Ranges": "bytes",
    },
  });
}
