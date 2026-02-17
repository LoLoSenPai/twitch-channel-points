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

  const text = await r.text();
  let j: unknown = null;
  try {
    j = JSON.parse(text);
  } catch {
    j = text;
  }
  if (!r.ok) {
    if (r.status === 401) {
      return new NextResponse(
        "Token Twitch invalide/expire. Deconnecte-toi puis reconnecte-toi avec Twitch.",
        { status: 401 }
      );
    }
    return new NextResponse(
      typeof j === "string" ? j : JSON.stringify(j),
      { status: r.status }
    );
  }

  const payload = j as { data?: TwitchReward[] };
  const items = (payload.data ?? []).map((x: TwitchReward) => ({
    id: x.id,
    title: x.title,
    cost: x.cost,
    is_enabled: x.is_enabled,
  }));

  return NextResponse.json({ items });
}
