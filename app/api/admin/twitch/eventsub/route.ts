import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getTwitchAppAccessToken } from "@/lib/twitch/app-token";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const appToken = await getTwitchAppAccessToken();

  const r = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    headers: {
      "Client-Id": process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${appToken}`,
    },
    cache: "no-store",
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) return new NextResponse(JSON.stringify(j), { status: r.status });

  return NextResponse.json(j);
}

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const appToken = await getTwitchAppAccessToken();

  const broadcasterId = process.env.TWITCH_BROADCASTER_ID!;
  const rewardId = process.env.TWITCH_REWARD_ID;
  const secret = process.env.TWITCH_EVENTSUB_SECRET!;
  const appUrl = process.env.APP_URL!;
  const callback = `${appUrl.replace(/\/$/, "")}/api/twitch/eventsub`;

  const body = {
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
      Authorization: `Bearer ${appToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) return new NextResponse(JSON.stringify(j), { status: r.status });

  return NextResponse.json({ ok: true, created: j });
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const appToken = await getTwitchAppAccessToken();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return new NextResponse("Missing id", { status: 400 });

  const r = await fetch(
    `https://api.twitch.tv/helix/eventsub/subscriptions?id=${encodeURIComponent(
      id
    )}`,
    {
      method: "DELETE",
      headers: {
        "Client-Id": process.env.TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${appToken}`,
      },
      cache: "no-store",
    }
  );

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return new NextResponse(t || "Delete failed", { status: r.status });
  }

  return NextResponse.json({ ok: true });
}
