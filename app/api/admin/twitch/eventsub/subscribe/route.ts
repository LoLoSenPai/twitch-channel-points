import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";

type SessionWithTwitch = {
  twitchAccessToken?: string | null;
};

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const session = (await auth()) as SessionWithTwitch;
  const accessToken = session?.twitchAccessToken ?? null;
  if (!accessToken) {
    return new NextResponse("Missing Twitch user token (re-login)", {
      status: 401,
    });
  }

  const body = await req.json().catch(() => null);
  const rewardIdFromBody = (body?.rewardId as string | undefined)?.trim();

  const broadcasterId = process.env.TWITCH_BROADCASTER_ID!;
  const secret = process.env.TWITCH_EVENTSUB_SECRET!;
  const appUrl = process.env.APP_URL!;
  const callback = `${appUrl}/api/twitch/eventsub`;

  // Si tu veux forcer un reward via env, tu peux le laisser en fallback
  const rewardId =
    rewardIdFromBody || (process.env.TWITCH_REWARD_ID ?? "").trim() || null;

  const payload = {
    type: "channel.channel_points_custom_reward_redemption.add",
    version: "1",
    condition: {
      broadcaster_user_id: broadcasterId,
      ...(rewardId ? { reward_id: rewardId } : {}),
    },
    transport: {
      method: "webhook",
      callback,
      secret,
    },
  };

  const r = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: {
      "Client-Id": process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) return new NextResponse(JSON.stringify(j), { status: r.status });

  return NextResponse.json({ ok: true });
}
