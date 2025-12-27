import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";

type SessionWithTwitch = { twitchAccessToken?: string | null };

type TwitchSub = {
  id: string;
  status: string;
  type: string;
  version?: string;
  created_at?: string;
  condition?: Record<string, unknown>;
  transport?: Record<string, unknown>;
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const session = (await auth()) as SessionWithTwitch;
  const accessToken = session?.twitchAccessToken ?? null;
  if (!accessToken) {
    return new NextResponse("Missing Twitch user token (re-login)", {
      status: 401,
    });
  }

  const r = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    headers: {
      "Client-Id": process.env.TWITCH_CLIENT_ID!,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) return new NextResponse(JSON.stringify(j), { status: r.status });

  const items = ((j?.data ?? []) as TwitchSub[]).map((s) => ({
    id: s.id,
    status: s.status,
    type: s.type,
    version: s.version,
    created_at: s.created_at,
    condition: s.condition,
    transport: s.transport,
  }));

  return NextResponse.json({ items });
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const session = (await auth()) as SessionWithTwitch;
  const accessToken = session?.twitchAccessToken ?? null;
  if (!accessToken) {
    return new NextResponse("Missing Twitch user token (re-login)", {
      status: 401,
    });
  }

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
        Authorization: `Bearer ${accessToken}`,
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
