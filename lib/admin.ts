import { auth } from "@/lib/auth";

function parseAdminIds() {
  const raw = process.env.ADMIN_TWITCH_USER_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function requireAdmin() {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id as string | undefined;

  if (!twitchUserId)
    return { ok: false as const, status: 401 as const, twitchUserId: null };

  const admins = parseAdminIds();
  if (!admins.includes(twitchUserId))
    return { ok: false as const, status: 403 as const, twitchUserId };

  return { ok: true as const, status: 200 as const, twitchUserId };
}
