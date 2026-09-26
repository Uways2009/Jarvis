import { getProfile, profileCompleteness, saveProfile, type ProfilePatch } from "@/lib/profile";
import { json, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const profile = await getProfile();
  return json({ ok: true, profile, completeness: profileCompleteness(profile) });
}

export async function PUT(req: Request): Promise<Response> {
  const body = await readJsonBody<{ profile?: ProfilePatch } & ProfilePatch>(req);
  if (!body) return json({ ok: false, error: "Malformed JSON body." }, 400);

  // Accept either { profile: {...} } or the profile object itself.
  const incoming: ProfilePatch =
    (body as { profile?: ProfilePatch }).profile ?? (body as ProfilePatch);

  // Saving a real profile clears the seeded flag unless explicitly overridden.
  const next = await saveProfile({
    ...incoming,
    meta: {
      ...(incoming.meta ?? {}),
      seeded: incoming.meta?.seeded ?? false,
      label: incoming.meta?.label ?? incoming.company?.name ?? "Business profile",
    },
  });

  return json({ ok: true, profile: next, completeness: profileCompleteness(next) });
}
