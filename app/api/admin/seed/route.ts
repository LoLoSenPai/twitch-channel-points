import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Redemption } from "@/lib/models";
import { resolveTwitchUserIdOrLogin } from "@/lib/twitch/users";

function rid() {
  return crypto.randomBytes(16).toString("hex");
}

function parseViewers(value: unknown) {
  return String(value ?? "")
    .split(/[\n,;]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const { viewer, twitchUserId, count = 1 } = await req.json();
  const viewers = parseViewers(viewer ?? twitchUserId);
  if (!viewers.length) {
    return new NextResponse("Missing viewer(s)", { status: 400 });
  }

  const n = Math.max(1, Math.min(500, Number(count)));
  await db();
  const docs: Array<{
    redemptionId: string;
    twitchUserId: string;
    rewardId: string;
    status: string;
  }> = [];
  const resolvedUsers: Array<{
    twitchUserId: string;
    login: string;
    displayName: string;
  }> = [];
  const notFound: string[] = [];

  for (const rawViewer of viewers) {
    const resolvedUser = await resolveTwitchUserIdOrLogin(rawViewer);
    if (!resolvedUser) {
      notFound.push(rawViewer);
      continue;
    }
    resolvedUsers.push(resolvedUser);
    docs.push(
      ...Array.from({ length: n }).map(() => ({
        redemptionId: `seed_${Date.now()}_${rid()}`,
        twitchUserId: resolvedUser.twitchUserId,
        rewardId: process.env.TWITCH_REWARD_ID ?? "seed_reward",
        status: "PENDING",
      }))
    );
  }

  if (!docs.length) {
    return NextResponse.json(
      { ok: false, inserted: 0, resolvedUsers: [], notFound },
      { status: 404 }
    );
  }

  await Redemption.insertMany(docs);

  return NextResponse.json({
    ok: true,
    inserted: docs.length,
    resolvedUsers,
    notFound,
    perViewerCount: n,
  });
}
