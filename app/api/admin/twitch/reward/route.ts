import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";

interface TwitchReward {
  id: string;
  title: string;
  cost: number;
  is_enabled: boolean;
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const session = await auth();
  const accessToken = session?.twitchAccessToken ?? null;

  if (!accessToken) {
    return new NextResponse("Missing Twitch user token (re login)", {
      status: 401,
    });
  }

  const broadcasterId = process.env.TWITCH_BROADCASTER_ID!;
  const r = await fetch(
    `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`,
    {
      headers: {
        "Client-Id": process.env.TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  const j = await r.json();
  if (!r.ok) return new NextResponse(JSON.stringify(j), { status: r.status });

  const items = (j.data ?? []).map((x: TwitchReward) => ({
    id: x.id,
    title: x.title,
    cost: x.cost,
    is_enabled: x.is_enabled,
  }));

  return NextResponse.json({ items });
}
